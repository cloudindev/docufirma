import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { runStripeSetup } from "@/lib/stripe/setup";

function fakeStripe(existingLookupKeys: Record<string, number> = {}) {
  let n = 0;
  const created: string[] = [];
  const deactivated: string[] = [];
  const stripe = {
    prices: {
      list: async ({ lookup_keys }: { lookup_keys: string[] }) => {
        const key = lookup_keys[0]!;
        return key in existingLookupKeys
          ? {
              data: [
                {
                  id: `price_existing_${key}`,
                  unit_amount: existingLookupKeys[key],
                  active: true,
                  product: `prod_existing_${key}`,
                },
              ],
            }
          : { data: [] };
      },
      create: async (p: { lookup_key: string }) => {
        created.push(p.lookup_key);
        return { id: `price_new_${++n}` };
      },
      update: async (id: string, p: { active: boolean }) => {
        if (p.active === false) deactivated.push(id);
        return { id };
      },
    },
    products: {
      create: async () => ({ id: `prod_${++n}` }),
      update: async (id: string) => ({ id }),
    },
    billingPortal: {
      configurations: {
        list: async () => ({ data: [] }),
        create: async () => ({ id: "bpc_1" }),
      },
    },
    webhookEndpoints: {
      list: async () => ({ data: [] }),
      create: async (p: { url: string; enabled_events: string[] }) => {
        expect(p.enabled_events).toContain("checkout.session.completed");
        return { id: "we_1", secret: "whsec_test", url: p.url };
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, created, deactivated };
}

function fakeAdmin() {
  const packs = [
    {
      id: "p1",
      slug: "pack-25",
      kind: "signatures",
      credits: 25,
      price_cents: 1500,
      name_es: "Pack 25 firmas",
    },
    {
      id: "p2",
      slug: "sms-100",
      kind: "sms",
      credits: 100,
      price_cents: 900,
      name_es: "Pack 100 SMS",
    },
  ];
  const updates: Record<string, string> = {};
  const admin = {
    from: () => ({
      select: () => ({ order: async () => ({ data: packs, error: null }) }),
      update: (row: { stripe_price_id: string }) => ({
        eq: async (_col: string, id: string) => {
          updates[id] = row.stripe_price_id;
          return { error: null };
        },
      }),
    }),
  };
  return { admin: admin as unknown as SupabaseClient, updates };
}

describe("Stripe setup", () => {
  it("creates Pro, signature and SMS pack prices, portal and webhook", async () => {
    const { stripe, created } = fakeStripe();
    const { admin, updates } = fakeAdmin();
    const report = await runStripeSetup(stripe, admin, {
      appUrl: "https://docufirma.es/",
      portal: true,
      webhook: true,
    });
    expect(created).toEqual(["docufirma_pro_monthly", "docufirma_pack_25", "docufirma_sms_100"]);
    expect(Object.keys(updates)).toEqual(["p1", "p2"]);
    expect(report.packs.map((p) => p.kind)).toEqual(["signatures", "sms"]);
    expect(report.webhook).toMatchObject({
      url: "https://docufirma.es/api/stripe/webhook",
      created: true,
      secret: "whsec_test",
    });
    expect(report.portal).toEqual({ id: "bpc_1", created: true });
  });

  it("reuses existing prices with the same amount", async () => {
    const { stripe, created } = fakeStripe({ docufirma_pro_monthly: 900, docufirma_sms_100: 900 });
    const { admin } = fakeAdmin();
    const report = await runStripeSetup(stripe, admin, { appUrl: "https://docufirma.es" });
    expect(created).toEqual(["docufirma_pack_25"]);
    expect(report.proPriceId).toBe("price_existing_docufirma_pro_monthly");
    expect(report.webhook).toBeUndefined();
  });

  it("replaces a price whose amount changed and stops selling the old one", async () => {
    const { stripe, created, deactivated } = fakeStripe({
      docufirma_pro_monthly: 900,
      docufirma_pack_25: 1500,
      docufirma_sms_100: 500,
    });
    const { admin } = fakeAdmin();
    await runStripeSetup(stripe, admin, { appUrl: "https://docufirma.es" });
    expect(created).toEqual(["docufirma_sms_100"]);
    expect(deactivated).toEqual(["price_existing_docufirma_sms_100"]);
  });
});
