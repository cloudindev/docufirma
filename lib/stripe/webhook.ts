import "server-only";
import type Stripe from "stripe";
import { PLAN } from "@/lib/config";
import { sendAccountNotice } from "@/lib/email";
import { appUrl } from "@/lib/env-public";
import { getPathname } from "@/lib/i18n/navigation";
import { type AdminSupabase, createAdminClient } from "@/lib/supabase/admin";
import type { Enums } from "@/types/database";

type SubStatus = Enums<"subscription_status">;
const STATUSES: SubStatus[] = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
];

const idOf = (v: string | { id: string } | null | undefined) =>
  typeof v === "string" ? v : (v?.id ?? null);

async function userIdFor(
  admin: AdminSupabase,
  opts: { metadataUserId?: string | null; customerId?: string | null },
) {
  if (opts.metadataUserId && /^[0-9a-f-]{36}$/.test(opts.metadataUserId)) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("id", opts.metadataUserId)
      .maybeSingle();
    if (data) return data.id;
  }
  if (opts.customerId) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", opts.customerId)
      .maybeSingle();
    if (data) return data.id;
  }
  return null;
}

async function linkCustomer(admin: AdminSupabase, userId: string, customerId: string | null) {
  if (!customerId) return;
  await admin
    .from("profiles")
    .update({ stripe_customer_id: customerId })
    .eq("id", userId)
    .is("stripe_customer_id", null);
}

async function upsertSubscription(admin: AdminSupabase, sub: Stripe.Subscription) {
  const customerId = idOf(sub.customer);
  const userId = await userIdFor(admin, { metadataUserId: sub.metadata?.user_id, customerId });
  if (!userId) throw new Error(`No user for subscription ${sub.id}`);
  await linkCustomer(admin, userId, customerId);
  const item = sub.items?.data?.[0];
  const status = (
    STATUSES.includes(sub.status as SubStatus) ? sub.status : "incomplete"
  ) as SubStatus;
  const row = {
    user_id: userId,
    stripe_subscription_id: sub.id,
    status,
    price_id: item?.price?.id ?? null,
    current_period_start: item?.current_period_start
      ? new Date(item.current_period_start * 1000).toISOString()
      : null,
    current_period_end: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
  };
  const { error } = await admin
    .from("subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" });
  if (error) throw new Error(error.message);
}

async function grantPack(admin: AdminSupabase, session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return; // async methods: granted on async_payment_succeeded
  const userId = await userIdFor(admin, {
    metadataUserId: session.metadata?.user_id,
    customerId: idOf(session.customer),
  });
  if (!userId) throw new Error(`No user for checkout ${session.id}`);
  await linkCustomer(admin, userId, idOf(session.customer));
  const packId = session.metadata?.pack_id ?? null;
  let credits = Number(session.metadata?.credits ?? 0);
  let kind = session.metadata?.kind === "sms_pack" ? "sms" : "signatures";
  if (packId) {
    const { data: pack } = await admin
      .from("credit_packs")
      .select("credits, kind")
      .eq("id", packId)
      .maybeSingle();
    if (pack) {
      credits = pack.credits; // catalogue is the source of truth
      kind = pack.kind;
    }
  }
  if (!Number.isInteger(credits) || credits <= 0)
    throw new Error(`Checkout ${session.id} without credits`);
  const paymentRef = idOf(session.payment_intent) ?? session.id;
  const { error } = await admin.rpc(kind === "sms" ? "grant_sms_pack" : "grant_pack_credits", {
    p_user_id: userId,
    p_amount: credits,
    p_payment_ref: paymentRef,
    p_pack_id: packId ?? undefined,
  });
  if (error) throw new Error(error.message);
}

/** invoice.paid for the Pro subscription → 10 monthly credits valid until the end of the period. */
async function grantMonthly(admin: AdminSupabase, invoice: Stripe.Invoice) {
  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription ?? null);
  if (!subscriptionId) return; // one-off invoices (packs) grant nothing here
  const proPrice = process.env.STRIPE_PRICE_PRO_MONTHLY;
  const line =
    invoice.lines?.data?.find((l) => !proPrice || l.pricing?.price_details?.price === proPrice) ??
    invoice.lines?.data?.[0];
  const periodEnd = line?.period?.end ?? invoice.period_end;
  const userId = await userIdFor(admin, {
    metadataUserId: invoice.parent?.subscription_details?.metadata?.user_id,
    customerId: idOf(invoice.customer),
  });
  if (!userId) throw new Error(`No user for invoice ${invoice.id}`);
  const { error } = await admin.rpc("grant_monthly_credits", {
    p_user_id: userId,
    p_amount: PLAN.monthlyCredits,
    p_expires_at: new Date(periodEnd * 1000).toISOString(),
    p_invoice_id: invoice.id ?? `invoice:${subscriptionId}:${periodEnd}`,
  });
  if (error) throw new Error(error.message);
}

async function notifyPaymentFailed(admin: AdminSupabase, invoice: Stripe.Invoice) {
  const userId = await userIdFor(admin, { customerId: idOf(invoice.customer) });
  if (!userId) return;
  const { data: profile } = await admin
    .from("profiles")
    .select("email, locale")
    .eq("id", userId)
    .single();
  if (!profile) return;
  const locale = profile.locale === "en" ? "en" : "es";
  await sendAccountNotice(profile.email, {
    locale,
    kind: "paymentFailed",
    ctaUrl: appUrl(getPathname({ href: "/app/billing", locale })),
  });
}

/**
 * Processes a verified Stripe event exactly once (stripe_events is the idempotency log).
 * Throws on failure so the route answers 500 and Stripe retries.
 */
export async function handleStripeEvent(
  event: Stripe.Event,
  admin: AdminSupabase = createAdminClient(),
) {
  const { data: existing } = await admin
    .from("stripe_events")
    .select("processed_at")
    .eq("id", event.id)
    .maybeSingle();
  if (existing?.processed_at) return { duplicate: true };
  if (!existing) {
    await admin
      .from("stripe_events")
      .insert({ id: event.id, type: event.type, payload: event as unknown as never })
      .then(
        ({ error }) =>
          error && error.code !== "23505" && console.warn("[stripe] log", error.message),
      );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (session.mode === "payment") await grantPack(admin, session);
        else if (session.mode === "subscription") {
          const userId = await userIdFor(admin, {
            metadataUserId: session.metadata?.user_id,
            customerId: idOf(session.customer),
          });
          if (userId) await linkCustomer(admin, userId, idOf(session.customer));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await upsertSubscription(admin, event.data.object);
        break;
      case "invoice.paid":
        await grantMonthly(admin, event.data.object);
        break;
      case "invoice.payment_failed":
        await notifyPaymentFailed(admin, event.data.object);
        break;
      default:
        break; // not relevant
    }
    await admin
      .from("stripe_events")
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq("id", event.id);
    return { duplicate: false };
  } catch (error) {
    await admin
      .from("stripe_events")
      .update({ error: (error as Error).message.slice(0, 1000) })
      .eq("id", event.id);
    throw error;
  }
}
