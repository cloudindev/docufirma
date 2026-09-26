/**
 * Automatic top-up (D-040). When the balance of signatures or SMS falls to the minimum the user
 * chose, the selected pack is charged off-session to the saved card through a Stripe invoice
 * (proper VAT invoice, Stripe Tax) and credited right away. `claim_auto_recharge` decides and
 * rate-limits in the database, so bursts of sends never charge twice.
 * No "server-only" import so it can be unit-tested with fakes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { Database } from "@/types/database";
import { STRIPE_APP } from "./setup";

export type RechargeKind = "signatures" | "sms";

export type RechargeOutcome =
  | { status: "skipped" }
  | { status: "charged"; invoiceId: string; credits: number; amountCents: number }
  | { status: "action_required"; invoiceId: string; hostedUrl: string | null }
  | { status: "failed"; reason: string };

type Admin = SupabaseClient<Database>;

export type RechargeNotice = {
  kind: "autoRecharged" | "autoRechargeFailed";
  userId: string;
  packLabel: { credits: number; kind: RechargeKind };
  amountCents: number;
  ctaUrl?: string | null;
};

/** The card to charge: the customer's default, else the most recent saved card. */
export async function savedCard(
  stripe: Stripe,
  customerId: string,
): Promise<{ id: string; brand: string; last4: string; expMonth: number; expYear: number } | null> {
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  });
  if ("deleted" in customer && customer.deleted) return null;
  const def = customer.invoice_settings?.default_payment_method;
  let pm: Stripe.PaymentMethod | undefined =
    def && typeof def !== "string" && def.type === "card" ? def : undefined;
  if (!pm) {
    const list = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
    pm = list.data[0];
  }
  if (!pm?.card) return null;
  return {
    id: pm.id,
    brand: pm.card.brand,
    last4: pm.card.last4,
    expMonth: pm.card.exp_month,
    expYear: pm.card.exp_year,
  };
}

/** Credits a paid top-up invoice. Idempotent per invoice (used by the charge and the webhook). */
export async function grantRechargeInvoice(admin: Admin, invoice: Stripe.Invoice) {
  const m = invoice.metadata ?? {};
  const userId = m.user_id;
  const credits = Number(m.credits);
  if (!invoice.id || !userId || !Number.isInteger(credits) || credits <= 0)
    throw new Error(`Top-up invoice ${invoice.id} without user or credits`);
  const { error } = await admin.rpc(
    m.kind === "sms_pack" ? "grant_sms_pack" : "grant_pack_credits",
    {
      p_user_id: userId,
      p_amount: credits,
      p_payment_ref: invoice.id,
      p_pack_id: m.pack_id || undefined,
    },
  );
  if (error) throw new Error(error.message);
}

const isCardProblem = (e: unknown) => {
  const err = e as { type?: string; code?: string };
  return (
    err?.type === "StripeCardError" ||
    [
      "card_declined",
      "expired_card",
      "insufficient_funds",
      "payment_method_not_available",
    ].includes(err?.code ?? "")
  );
};

export async function runAutoRecharge(
  deps: {
    stripe: Stripe | null;
    admin: Admin;
    notify: (n: RechargeNotice) => Promise<unknown>;
  },
  userId: string,
  kind: RechargeKind,
): Promise<RechargeOutcome> {
  const { stripe, admin, notify } = deps;
  const { data: claimed, error: claimError } = await admin.rpc("claim_auto_recharge", {
    p_user_id: userId,
    p_kind: kind,
  });
  if (claimError) throw new Error(claimError.message);
  if (!claimed?.user_id || !claimed.pack_id) return { status: "skipped" };

  const record = async (patch: { last_error?: string | null; enabled?: boolean; ok?: boolean }) => {
    await admin
      .from("auto_recharge")
      .update({
        last_error: patch.last_error ?? null,
        ...(patch.enabled === false ? { enabled: false } : {}),
        ...(patch.ok ? { last_success_at: new Date().toISOString() } : {}),
      })
      .eq("user_id", userId)
      .eq("kind", kind);
  };

  const [{ data: pack }, { data: profile }] = await Promise.all([
    admin
      .from("credit_packs")
      .select("id, slug, kind, credits, price_cents, stripe_price_id")
      .eq("id", claimed.pack_id)
      .single(),
    admin.from("profiles").select("stripe_customer_id").eq("id", userId).single(),
  ]);
  const packLabel = { credits: pack?.credits ?? 0, kind };
  const fail = async (reason: string, pause: boolean) => {
    await record({ last_error: reason, enabled: pause ? false : undefined });
    if (pause)
      await notify({
        kind: "autoRechargeFailed",
        userId,
        packLabel,
        amountCents: pack?.price_cents ?? 0,
      });
    return { status: "failed", reason } as const;
  };

  if (!stripe) return fail("not_configured", false);
  if (!pack?.stripe_price_id) return fail("pack_not_configured", false);
  if (!profile?.stripe_customer_id) return fail("no_payment_method", true);
  const card = await savedCard(stripe, profile.stripe_customer_id).catch(() => null);
  if (!card) return fail("no_payment_method", true);

  const metadata = {
    app: STRIPE_APP,
    user_id: userId,
    kind: kind === "sms" ? "sms_pack" : "pack",
    pack_id: pack.id,
    credits: String(pack.credits),
    auto_recharge: "1",
  };
  let invoice: Stripe.Invoice;
  try {
    // One invoice per claimed attempt, even if this request is retried.
    const key = `auto-recharge:${userId}:${kind}:${claimed.last_attempt_at}`;
    invoice = await stripe.invoices.create(
      {
        customer: profile.stripe_customer_id,
        collection_method: "charge_automatically",
        auto_advance: false,
        automatic_tax: { enabled: true },
        pending_invoice_items_behavior: "exclude",
        default_payment_method: card.id,
        description:
          kind === "sms"
            ? `Recarga automática · ${pack.credits} SMS`
            : `Recarga automática · ${pack.credits} firmas`,
        metadata,
      },
      { idempotencyKey: `${key}:invoice` },
    );
    await stripe.invoiceItems.create(
      {
        customer: profile.stripe_customer_id,
        invoice: invoice.id!,
        pricing: { price: pack.stripe_price_id },
        metadata,
      },
      { idempotencyKey: `${key}:item` },
    );
    invoice = await stripe.invoices.finalizeInvoice(invoice.id!, { auto_advance: false });
  } catch (e) {
    return fail(`stripe: ${(e as Error).message}`.slice(0, 300), false);
  }

  try {
    const paid = await stripe.invoices.pay(invoice.id!, {
      off_session: true,
      payment_method: card.id,
    });
    if (paid.status !== "paid") throw Object.assign(new Error("not paid"), { code: "not_paid" });
    await grantRechargeInvoice(admin, paid);
    await record({ ok: true });
    await notify({
      kind: "autoRecharged",
      userId,
      packLabel,
      amountCents: paid.amount_paid ?? pack.price_cents,
    });
    return {
      status: "charged",
      invoiceId: paid.id!,
      credits: pack.credits,
      amountCents: paid.amount_paid ?? pack.price_cents,
    };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "authentication_required" || code === "invoice_payment_intent_requires_action") {
      // 3-D Secure: the customer completes the payment on Stripe; the webhook credits it then.
      const open = await stripe.invoices.retrieve(invoice.id!).catch(() => invoice);
      await record({ last_error: "authentication_required", enabled: false });
      await notify({
        kind: "autoRechargeFailed",
        userId,
        packLabel,
        amountCents: pack.price_cents,
        ctaUrl: open.hosted_invoice_url ?? null,
      });
      return {
        status: "action_required",
        invoiceId: invoice.id!,
        hostedUrl: open.hosted_invoice_url ?? null,
      };
    }
    // Leave no unpaid invoice behind (voiding a paid one fails harmlessly; the webhook credits it).
    await stripe.invoices.voidInvoice(invoice.id!).catch(() => undefined);
    // A declined card pauses the top-up; transient errors are retried after the cooldown.
    const declined = isCardProblem(e);
    return fail(
      declined ? `card: ${code ?? "declined"}` : `stripe: ${(e as Error).message}`.slice(0, 300),
      declined,
    );
  }
}
