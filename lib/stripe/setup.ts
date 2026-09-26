/**
 * Idempotent Stripe configuration shared by `pnpm stripe:setup` and POST /api/admin/stripe-setup.
 * Creates (or reuses, by lookup_key) the Pro price and one price per catalog pack (signature
 * and SMS packs), syncs `credit_packs.stripe_price_id`, and optionally creates the Customer
 * Portal configuration and the webhook endpoint. No "server-only" import: the CLI uses it too.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { PLAN } from "../config";

export const PRO_LOOKUP_KEY = "docufirma_pro_monthly";

export const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
];

type PackRow = {
  id: string;
  slug: string;
  kind: string;
  credits: number;
  price_cents: number;
  name_es: string;
};

export type SetupReport = {
  proPriceId: string;
  packs: { slug: string; kind: string; priceId: string; created: boolean }[];
  portal?: { id: string; created: boolean };
  webhook?: { id: string; url: string; created: boolean; secret?: string };
  log: string[];
};

async function ensurePrice(
  stripe: Stripe,
  log: string[],
  opts: {
    lookupKey: string;
    productName: string;
    productDescription: string;
    unitAmount: number;
    recurring?: Stripe.PriceCreateParams.Recurring;
    metadata: Record<string, string>;
  },
): Promise<{ id: string; created: boolean }> {
  const existing = await stripe.prices.list({ lookup_keys: [opts.lookupKey], limit: 1 });
  const found = existing.data[0];
  if (found && found.unit_amount === opts.unitAmount && found.active) {
    log.push(`✓ ${opts.lookupKey} → ${found.id} (existing)`);
    return { id: found.id, created: false };
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
  log.push(`＋ ${opts.lookupKey} → ${price.id} (created)`);
  return { id: price.id, created: true };
}

export async function runStripeSetup(
  stripe: Stripe,
  admin: SupabaseClient,
  opts: { appUrl: string; portal?: boolean; webhook?: boolean },
): Promise<SetupReport> {
  const log: string[] = [];
  const pro = await ensurePrice(stripe, log, {
    lookupKey: PRO_LOOKUP_KEY,
    productName: "DocuFirma Pro",
    productDescription: `${PLAN.monthlyCredits} firmas al mes · Firma electrónica avanzada con sello de tiempo cualificado`,
    unitAmount: PLAN.monthlyPriceCents,
    recurring: { interval: "month" },
    metadata: { plan: PLAN.slug, monthly_credits: String(PLAN.monthlyCredits) },
  });

  const { data, error } = await admin
    .from("credit_packs")
    .select("id, slug, kind, credits, price_cents, name_es")
    .order("sort_order");
  if (error) throw new Error(`credit_packs: ${error.message}`);
  const packs: SetupReport["packs"] = [];
  for (const pack of (data ?? []) as PackRow[]) {
    const sms = pack.kind === "sms";
    const price = await ensurePrice(stripe, log, {
      lookupKey: `docufirma_${pack.slug.replace(/-/g, "_")}`,
      productName: `DocuFirma · ${pack.name_es}`,
      productDescription: sms
        ? `${pack.credits} SMS para códigos de verificación de firmantes, sin caducidad`
        : `${pack.credits} firmas adicionales sin caducidad`,
      unitAmount: pack.price_cents,
      metadata: { pack: pack.slug, kind: pack.kind, credits: String(pack.credits) },
    });
    const { error: upErr } = await admin
      .from("credit_packs")
      .update({ stripe_price_id: price.id })
      .eq("id", pack.id);
    if (upErr) throw new Error(`credit_packs update: ${upErr.message}`);
    packs.push({ slug: pack.slug, kind: pack.kind, priceId: price.id, created: price.created });
  }

  const report: SetupReport = { proPriceId: pro.id, packs, log };
  const base = opts.appUrl.replace(/\/$/, "");

  if (opts.portal) {
    const existing = await stripe.billingPortal.configurations.list({ limit: 100 });
    const ours = existing.data.find((c) => c.metadata?.app === "docufirma" && c.active);
    if (ours) {
      report.portal = { id: ours.id, created: false };
      log.push(`✓ portal ${ours.id} (existing)`);
    } else {
      const config = await stripe.billingPortal.configurations.create({
        business_profile: { headline: "DocuFirma" },
        features: {
          customer_update: {
            enabled: true,
            allowed_updates: ["email", "address", "tax_id", "name"],
          },
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: {
            enabled: true,
            mode: "at_period_end",
            cancellation_reason: { enabled: true, options: ["too_expensive", "unused", "other"] },
          },
        },
        default_return_url: `${base}/es/app/billing`,
        metadata: { app: "docufirma" },
      });
      report.portal = { id: config.id, created: true };
      log.push(`＋ portal ${config.id} (created)`);
    }
  }

  if (opts.webhook) {
    const url = `${base}/api/stripe/webhook`;
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const existing = endpoints.data.find((w) => w.url === url && w.status === "enabled");
    if (existing) {
      report.webhook = { id: existing.id, url, created: false };
      log.push(`✓ webhook ${existing.id} (existing; its secret is only shown when created)`);
    } else {
      const created = await stripe.webhookEndpoints.create({
        url,
        enabled_events: WEBHOOK_EVENTS,
        description: "DocuFirma",
      });
      report.webhook = { id: created.id, url, created: true, secret: created.secret };
      log.push(`＋ webhook ${created.id} (created)`);
    }
  }
  return report;
}
