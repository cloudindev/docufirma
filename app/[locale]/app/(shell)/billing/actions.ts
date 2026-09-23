"use server";

import { z } from "zod";
import { type ActionResult, fail, ok } from "@/lib/actions/result";
import { getSessionUser } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/routing";
import {
  BillingError,
  createPackCheckout,
  createPortalSession,
  createSubscriptionCheckout,
} from "@/lib/stripe/billing";
import { getStripe } from "@/lib/stripe/client";

async function run(
  fn: (userId: string) => Promise<string>,
): Promise<ActionResult<{ url: string }>> {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized");
  if (!getStripe()) return fail("not_configured");
  try {
    return ok({ url: await fn(user.id) });
  } catch (error) {
    if (error instanceof BillingError) return fail(error.code);
    console.error("[billing]", (error as Error).message);
    return fail("stripe_error");
  }
}

export async function startSubscriptionCheckout(localeRaw: string) {
  const locale = isLocale(localeRaw) ? localeRaw : "es";
  return run((userId) => createSubscriptionCheckout(userId, locale));
}

export async function startPackCheckout(localeRaw: string, slug: string) {
  const locale = isLocale(localeRaw) ? localeRaw : "es";
  if (
    !z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .safeParse(slug).success
  )
    return fail("pack_not_found");
  return run((userId) => createPackCheckout(userId, locale, slug));
}

export async function openCustomerPortal(localeRaw: string) {
  const locale = isLocale(localeRaw) ? localeRaw : "es";
  return run((userId) => createPortalSession(userId, locale));
}
