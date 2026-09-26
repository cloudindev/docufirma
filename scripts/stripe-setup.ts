/**
 * Creates (or finds, by lookup_key) the Stripe products and prices DocuFirma needs (Pro plan,
 * signature packs and SMS packs), syncs the pack price ids into public.credit_packs and prints
 * what to configure. Same logic as POST /api/admin/stripe-setup (lib/stripe/setup.ts).
 *
 *   STRIPE_SECRET_KEY=sk_... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm stripe:setup
 *   --portal   also create the Customer Portal configuration
 *   --webhook  also create the webhook endpoint (prints its signing secret once)
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { runStripeSetup } from "../lib/stripe/setup";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !url || !service)
    throw new Error(
      "STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    );
  const report = await runStripeSetup(
    new Stripe(key),
    createClient(url, service, { auth: { persistSession: false } }),
    {
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://docufirma.es",
      portal: process.argv.includes("--portal"),
      webhook: process.argv.includes("--webhook"),
    },
  );
  for (const line of report.log) console.log(line);
  console.log(`\nSTRIPE_PRICE_PRO_MONTHLY=${report.proPriceId} (optional: found by lookup key)`);
  if (report.webhook?.secret) console.log(`STRIPE_WEBHOOK_SECRET=${report.webhook.secret}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
