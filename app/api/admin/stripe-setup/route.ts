import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { appUrl } from "@/lib/env-public";
import { getStripe } from "@/lib/stripe/client";
import { runStripeSetup } from "@/lib/stripe/setup";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Operator tool: configures Stripe from the deployed app (no local CLI needed).
 *   curl -X POST https://docufirma.es/api/admin/stripe-setup \
 *     -H "Authorization: Bearer $CRON_SECRET" -H "content-type: application/json" \
 *     -d '{"portal":true,"webhook":true}'
 * Idempotent: existing prices, portal and webhook are reused. The webhook signing secret is
 * returned only when the endpoint is created.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "STRIPE_SECRET_KEY missing" }, { status: 400 });
  const opts = z
    .object({ portal: z.boolean().optional(), webhook: z.boolean().optional() })
    .catch({})
    .parse(await request.json().catch(() => ({})));
  try {
    const report = await runStripeSetup(stripe, createAdminClient(), { appUrl: appUrl(), ...opts });
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}
