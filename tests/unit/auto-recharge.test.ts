import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { type RechargeNotice, runAutoRecharge } from "@/lib/stripe/auto-recharge";
import type { Database } from "@/types/database";

const PACK = {
  id: "pack-sms",
  slug: "sms-100",
  kind: "sms",
  credits: 100,
  price_cents: 1200,
  stripe_price_id: "price_sms_100",
};

function fakeAdmin(opts: { claimed?: boolean; customer?: string | null } = {}) {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const updates: Record<string, unknown>[] = [];
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      if (fn === "claim_auto_recharge")
        return {
          data:
            opts.claimed === false
              ? { user_id: null }
              : { user_id: "u1", kind: "sms", pack_id: PACK.id, last_attempt_at: "t1" },
          error: null,
        };
      return { data: true, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            table === "credit_packs"
              ? { data: PACK, error: null }
              : {
                  data: {
                    stripe_customer_id: opts.customer === undefined ? "cus_1" : opts.customer,
                  },
                  error: null,
                },
        }),
      }),
      update: (row: Record<string, unknown>) => {
        updates.push(row);
        return { eq: () => ({ eq: async () => ({ error: null }) }) };
      },
    }),
  };
  return { admin: admin as unknown as SupabaseClient<Database>, rpcs, updates };
}

function fakeStripe(opts: { card?: boolean; payError?: { code: string; type?: string } } = {}) {
  const calls: string[] = [];
  const invoice = {
    id: "in_1",
    status: "open",
    amount_paid: 0,
    hosted_invoice_url: "https://pay.stripe.test/in_1",
    metadata: {} as Record<string, string>,
  };
  const stripe = {
    customers: {
      retrieve: async () => ({ id: "cus_1", invoice_settings: { default_payment_method: null } }),
    },
    paymentMethods: {
      list: async () => ({
        data:
          opts.card === false
            ? []
            : [
                {
                  id: "pm_1",
                  type: "card",
                  card: { brand: "visa", last4: "4242", exp_month: 1, exp_year: 2030 },
                },
              ],
      }),
    },
    invoices: {
      create: async (p: { metadata: Record<string, string> }) => {
        calls.push("create");
        invoice.metadata = p.metadata;
        return { ...invoice };
      },
      finalizeInvoice: async () => {
        calls.push("finalize");
        return { ...invoice };
      },
      pay: async () => {
        calls.push("pay");
        if (opts.payError) throw Object.assign(new Error("declined"), opts.payError);
        return { ...invoice, status: "paid", amount_paid: 1200 };
      },
      retrieve: async () => ({ ...invoice }),
      voidInvoice: async () => {
        calls.push("void");
        return { ...invoice, status: "void" };
      },
    },
    invoiceItems: {
      create: async (p: { pricing: { price: string } }) => {
        calls.push(`item:${p.pricing.price}`);
        return { id: "ii_1" };
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, calls };
}

describe("automatic top-up", () => {
  it("does nothing when the database does not claim a top-up", async () => {
    const { admin } = fakeAdmin({ claimed: false });
    const { stripe, calls } = fakeStripe();
    const res = await runAutoRecharge({ stripe, admin, notify: async () => {} }, "u1", "sms");
    expect(res).toEqual({ status: "skipped" });
    expect(calls).toEqual([]);
  });

  it("charges the pack off-session, credits the invoice and notifies", async () => {
    const { admin, rpcs, updates } = fakeAdmin();
    const { stripe, calls } = fakeStripe();
    const notices: RechargeNotice[] = [];
    const res = await runAutoRecharge(
      { stripe, admin, notify: async (n) => void notices.push(n) },
      "u1",
      "sms",
    );
    expect(res).toMatchObject({
      status: "charged",
      invoiceId: "in_1",
      credits: 100,
      amountCents: 1200,
    });
    expect(calls).toEqual(["create", "item:price_sms_100", "finalize", "pay"]);
    expect(rpcs.find((r) => r.fn === "grant_sms_pack")?.args).toMatchObject({
      p_user_id: "u1",
      p_amount: 100,
      p_payment_ref: "in_1",
    });
    expect(updates.at(-1)).toHaveProperty("last_success_at");
    expect(notices[0]).toMatchObject({ kind: "autoRecharged", amountCents: 1200 });
  });

  it("pauses the top-up and voids the invoice when the card is declined", async () => {
    const { admin, rpcs, updates } = fakeAdmin();
    const { stripe, calls } = fakeStripe({
      payError: { code: "card_declined", type: "StripeCardError" },
    });
    const notices: RechargeNotice[] = [];
    const res = await runAutoRecharge(
      { stripe, admin, notify: async (n) => void notices.push(n) },
      "u1",
      "sms",
    );
    expect(res).toEqual({ status: "failed", reason: "card: card_declined" });
    expect(calls).toContain("void");
    expect(rpcs.some((r) => r.fn === "grant_sms_pack")).toBe(false);
    expect(updates.at(-1)).toMatchObject({ enabled: false });
    expect(notices[0]?.kind).toBe("autoRechargeFailed");
  });

  it("asks the customer to authenticate when 3-D Secure is required", async () => {
    const { admin, updates } = fakeAdmin();
    const { stripe } = fakeStripe({ payError: { code: "authentication_required" } });
    const notices: RechargeNotice[] = [];
    const res = await runAutoRecharge(
      { stripe, admin, notify: async (n) => void notices.push(n) },
      "u1",
      "sms",
    );
    expect(res).toMatchObject({
      status: "action_required",
      hostedUrl: "https://pay.stripe.test/in_1",
    });
    expect(updates.at(-1)).toMatchObject({ enabled: false, last_error: "authentication_required" });
    expect(notices[0]?.ctaUrl).toBe("https://pay.stripe.test/in_1");
  });

  it("pauses without charging when there is no saved card", async () => {
    const { admin, updates } = fakeAdmin();
    const { stripe, calls } = fakeStripe({ card: false });
    const res = await runAutoRecharge({ stripe, admin, notify: async () => {} }, "u1", "sms");
    expect(res).toEqual({ status: "failed", reason: "no_payment_method" });
    expect(calls).toEqual([]);
    expect(updates.at(-1)).toMatchObject({ enabled: false });
  });
});
