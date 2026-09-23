/**
 * Creates (or finds, by lookup_key) the Stripe products and prices DocuFirma needs, syncs the
 * pack price ids into public.credit_packs and prints the env vars to set.
 *
 *   STRIPE_SECRET_KEY=sk_... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm stripe:setup
 *   Add --portal to also create a Customer Portal configuration.
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { DEFAULT_PACKS, PLAN } from "../lib/config";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("STRIPE_SECRET_KEY is required");
const stripe = new Stripe(key);

async function ensurePrice(opts: {
  lookupKey: string;
  productName: string;
  productDescription: string;
  unitAmount: number;
  recurring?: Stripe.PriceCreateParams.Recurring;
  metadata: Record<string, string>;
}) {
  const existing = await stripe.prices.list({
    lookup_keys: [opts.lookupKey],
    expand: ["data.product"],
    limit: 1,
  });
  const found = existing.data[0];
  if (found && found.unit_amount === opts.unitAmount && found.active) {
    console.log(`✓ ${opts.lookupKey} → ${found.id} (existing)`);
    return found.id;
  }
  const product = await stripe.products.create({
    name: opts.productName,
    description: opts.productDescription,
    tax_code: "txcd_10103001", // SaaS - business use
    metadata: opts.metadata,
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: PLAN.currency,
    unit_amount: opts.unitAmount,
    tax_behavior: "inclusive", // prices shown include VAT (Stripe Tax computes the split)
    lookup_key: opts.lookupKey,
    transfer_lookup_key: true,
    recurring: opts.recurring,
    metadata: opts.metadata,
  });
  console.log(`＋ ${opts.lookupKey} → ${price.id} (created)`);
  return price.id;
}

async function main() {
  const proPrice = await ensurePrice({
    lookupKey: "docufirma_pro_monthly",
    productName: "DocuFirma Pro",
    productDescription: `${PLAN.monthlyCredits} firmas al mes · Firma electrónica avanzada con sello de tiempo cualificado`,
    unitAmount: PLAN.monthlyPriceCents,
    recurring: { interval: "month" },
    metadata: { plan: PLAN.slug, monthly_credits: String(PLAN.monthlyCredits) },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin =
    supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
      : null;
  const { data: packs } = admin
    ? await admin.from("credit_packs").select("*").order("sort_order")
    : { data: null };
  const catalog = packs?.length
    ? packs.map((p) => ({
        id: p.id as string,
        slug: p.slug as string,
        credits: p.credits as number,
        priceCents: p.price_cents as number,
        name: p.name_es as string,
      }))
    : DEFAULT_PACKS.map((p) => ({
        id: null,
        slug: p.slug,
        credits: p.credits,
        priceCents: p.priceCents,
        name: `Pack ${p.credits} firmas`,
      }));

  for (const pack of catalog) {
    const priceId = await ensurePrice({
      lookupKey: `docufirma_${pack.slug.replace(/-/g, "_")}`,
      productName: `DocuFirma · ${pack.name}`,
      productDescription: `${pack.credits} firmas adicionales sin caducidad`,
      unitAmount: pack.priceCents,
      metadata: { pack: pack.slug, credits: String(pack.credits) },
    });
    if (admin && pack.id)
      await admin.from("credit_packs").update({ stripe_price_id: priceId }).eq("id", pack.id);
  }

  if (process.argv.includes("--portal")) {
    const config = await stripe.billingPortal.configurations.create({
      business_profile: { headline: "DocuFirma" },
      features: {
        customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id", "name"] },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: {
          enabled: true,
          mode: "at_period_end",
          cancellation_reason: { enabled: true, options: ["too_expensive", "unused", "other"] },
        },
      },
      default_return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://docufirma.es"}/es/app/billing`,
    });
    console.log(`＋ portal configuration ${config.id} (set as default in the Dashboard if needed)`);
  }

  console.log(`\nSet in your environment:\nSTRIPE_PRICE_PRO_MONTHLY=${proPrice}`);
  console.log(
    "Webhook endpoint: https://docufirma.es/api/stripe/webhook with events: checkout.session.completed, checkout.session.async_payment_succeeded, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
