import "server-only";
import Stripe from "stripe";

let stripe: Stripe | null | undefined;

/** Stripe SDK client, or null when STRIPE_SECRET_KEY is not configured. */
export function getStripe(): Stripe | null {
  if (stripe !== undefined) return stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  stripe = key
    ? new Stripe(key, {
        appInfo: { name: "DocuFirma", url: "https://docufirma.es" },
        maxNetworkRetries: 2,
      })
    : null;
  return stripe;
}

export function requireStripe(): Stripe {
  const client = getStripe();
  if (!client) throw new Error("STRIPE_SECRET_KEY is not configured");
  return client;
}
