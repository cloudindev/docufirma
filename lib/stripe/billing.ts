import "server-only";
import type Stripe from "stripe";
import { PLAN } from "@/lib/config";
import { appUrl } from "@/lib/env-public";
import { getPathname } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import { fullName } from "@/lib/utils";
import { requireStripe } from "./client";
import { PRO_LOOKUP_KEY } from "./setup";

export class BillingError extends Error {
  constructor(
    readonly code: "not_configured" | "pack_not_found" | "no_customer" | "stripe_error",
    message?: string,
  ) {
    super(message ?? code);
  }
}

function billingUrl(locale: Locale, query = "") {
  return appUrl(`${getPathname({ href: "/app/billing", locale })}${query}`);
}

/** Returns the Stripe customer of a user, creating (and storing) it on first use. */
export async function ensureCustomer(userId: string): Promise<string> {
  const stripe = requireStripe();
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email, first_name, last_name, company_name, locale, stripe_customer_id")
    .eq("id", userId)
    .single();
  if (!profile) throw new BillingError("no_customer");
  if (profile.stripe_customer_id) return profile.stripe_customer_id;
  const customer = await stripe.customers.create(
    {
      email: profile.email,
      name:
        profile.company_name || fullName(profile.first_name, profile.last_name) || profile.email,
      preferred_locales: [profile.locale],
      metadata: { user_id: userId },
    },
    { idempotencyKey: `customer:${userId}` },
  );
  // Only set when still empty (concurrent checkouts must not overwrite each other).
  const { data: updated } = await admin
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId)
    .is("stripe_customer_id", null)
    .select("stripe_customer_id")
    .maybeSingle();
  if (updated?.stripe_customer_id) return updated.stripe_customer_id;
  const { data: again } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();
  return again?.stripe_customer_id ?? customer.id;
}

const checkoutBase = (
  customer: string,
  locale: Locale,
  userId: string,
): Stripe.Checkout.SessionCreateParams => ({
  customer,
  client_reference_id: userId,
  locale,
  automatic_tax: { enabled: true },
  customer_update: { address: "auto", name: "auto" },
  billing_address_collection: "auto",
  tax_id_collection: { enabled: true },
  success_url: billingUrl(locale, "?checkout=success&session_id={CHECKOUT_SESSION_ID}"),
  cancel_url: billingUrl(locale, "?checkout=canceled"),
});

let cachedProPrice: string | undefined;

/** STRIPE_PRICE_PRO_MONTHLY, or the price created by the Stripe setup (found by lookup key). */
async function proPriceId(stripe: Stripe): Promise<string> {
  const fromEnv = process.env.STRIPE_PRICE_PRO_MONTHLY;
  if (fromEnv) return fromEnv;
  if (cachedProPrice) return cachedProPrice;
  const { data } = await stripe.prices.list({
    lookup_keys: [PRO_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  if (!data[0])
    throw new BillingError("not_configured", "No Pro price: run the Stripe setup first");
  cachedProPrice = data[0].id;
  return cachedProPrice;
}

export async function createSubscriptionCheckout(userId: string, locale: Locale): Promise<string> {
  const stripe = requireStripe();
  const price = await proPriceId(stripe);
  const customer = await ensureCustomer(userId);
  const session = await stripe.checkout.sessions.create({
    ...checkoutBase(customer, locale, userId),
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { user_id: userId, plan: PLAN.slug } },
    metadata: { user_id: userId, kind: "subscription" },
  });
  if (!session.url) throw new BillingError("stripe_error", "Checkout session without URL");
  return session.url;
}

export async function createPackCheckout(
  userId: string,
  locale: Locale,
  packSlug: string,
): Promise<string> {
  const admin = createAdminClient();
  const { data: pack } = await admin
    .from("credit_packs")
    .select("*")
    .eq("slug", packSlug)
    .eq("active", true)
    .maybeSingle();
  if (!pack) throw new BillingError("pack_not_found");
  if (!pack.stripe_price_id)
    throw new BillingError(
      "not_configured",
      `Pack ${packSlug} has no stripe_price_id (run pnpm stripe:setup)`,
    );
  const stripe = requireStripe();
  const customer = await ensureCustomer(userId);
  const metadata = {
    user_id: userId,
    kind: pack.kind === "sms" ? "sms_pack" : "pack",
    pack_id: pack.id,
    credits: String(pack.credits),
  };
  const session = await stripe.checkout.sessions.create({
    ...checkoutBase(customer, locale, userId),
    mode: "payment",
    line_items: [{ price: pack.stripe_price_id, quantity: 1 }],
    allow_promotion_codes: true,
    invoice_creation: { enabled: true, invoice_data: { metadata } },
    payment_intent_data: { metadata },
    metadata,
  });
  if (!session.url) throw new BillingError("stripe_error", "Checkout session without URL");
  return session.url;
}

export async function createPortalSession(userId: string, locale: Locale): Promise<string> {
  const stripe = requireStripe();
  const customer = await ensureCustomer(userId);
  const session = await stripe.billingPortal.sessions.create({
    customer,
    locale,
    return_url: billingUrl(locale),
  });
  return session.url;
}

export type InvoiceSummary = {
  id: string;
  number: string | null;
  date: string;
  total: number;
  currency: string;
  status: string | null;
  url: string | null;
  pdf: string | null;
};

export async function listInvoices(customerId: string | null): Promise<InvoiceSummary[] | null> {
  if (!customerId) return [];
  try {
    const stripe = requireStripe();
    const invoices = await stripe.invoices.list({ customer: customerId, limit: 12 });
    return invoices.data.map((i) => ({
      id: i.id ?? "",
      number: i.number,
      date: new Date(i.created * 1000).toISOString(),
      total: i.total,
      currency: i.currency,
      status: i.status,
      url: i.hosted_invoice_url ?? null,
      pdf: i.invoice_pdf ?? null,
    }));
  } catch (error) {
    console.error("[stripe] invoices.list failed", (error as Error).message);
    return null;
  }
}
