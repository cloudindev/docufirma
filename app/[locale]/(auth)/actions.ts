"use server";

import { headers } from "next/headers";
import { redirect as nextRedirect } from "next/navigation";
import { getPathname, redirect } from "@/lib/i18n/navigation";
import { isLocale, type Locale } from "@/lib/i18n/routing";
import { type ActionResult, fail, ok, zodFieldErrors } from "@/lib/actions/result";
import { authErrorKey } from "@/lib/auth/errors";
import {
  forgotPasswordSchema,
  loginSchema,
  magicLinkSchema,
  registerSchema,
  resetPasswordSchema,
  safeNextPath,
} from "@/lib/auth/schemas";
import { appUrl } from "@/lib/env-public";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

function asLocale(value: string): Locale {
  return isLocale(value) ? value : "es";
}

async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

async function limited(action: string, limit: number, windowSeconds: number) {
  const { allowed } = await rateLimit(`auth:${action}:${await clientIp()}`, limit, windowSeconds);
  return !allowed;
}

function appHome(locale: Locale) {
  return getPathname({ href: "/app", locale });
}

export async function signInWithPassword(
  raw: unknown,
  localeRaw: string,
  nextRaw?: string,
): Promise<ActionResult> {
  const locale = asLocale(localeRaw);
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
  if (await limited("login", 10, 300)) return fail("rateLimited");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return fail(authErrorKey(error.code, error.message));

  nextRedirect(safeNextPath(nextRaw, appHome(locale)));
}

export async function sendMagicLink(
  raw: unknown,
  localeRaw: string,
  nextRaw?: string,
): Promise<ActionResult> {
  const locale = asLocale(localeRaw);
  const parsed = magicLinkSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
  if (await limited("magic", 5, 600)) return fail("rateLimited");

  const next = safeNextPath(nextRaw, appHome(locale));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: appUrl(`/auth/confirm?next=${encodeURIComponent(next)}`),
    },
  });
  // Do not reveal whether the account exists.
  if (error && authErrorKey(error.code, error.message) === "rateLimited")
    return fail("rateLimited");
  return ok();
}

export async function signUp(raw: unknown, localeRaw: string): Promise<ActionResult> {
  const locale = asLocale(localeRaw);
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
  if (await limited("signup", 5, 3600)) return fail("rateLimited");

  const onboarding = getPathname({ href: "/app/onboarding", locale });
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: appUrl(`/auth/confirm?next=${encodeURIComponent(onboarding)}`),
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        locale,
        terms_accepted_at: new Date().toISOString(),
      },
    },
  });
  if (error) return fail(authErrorKey(error.code, error.message));
  // Projects with email auto-confirmation (local stack) return a session right away.
  if (data.session) nextRedirect(onboarding);
  return ok();
}

export async function signInWithGoogle(localeRaw: string, nextRaw?: string): Promise<ActionResult> {
  const locale = asLocale(localeRaw);
  const next = safeNextPath(nextRaw, appHome(locale));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: appUrl(`/auth/callback?next=${encodeURIComponent(next)}`),
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) return fail(authErrorKey(error?.code, error?.message));
  nextRedirect(data.url);
}

export async function requestPasswordReset(raw: unknown, localeRaw: string): Promise<ActionResult> {
  const locale = asLocale(localeRaw);
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
  if (await limited("reset", 5, 3600)) return fail("rateLimited");

  const resetPath = getPathname({ href: "/reset-password", locale });
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: appUrl(`/auth/confirm?next=${encodeURIComponent(resetPath)}`),
  });
  if (error && authErrorKey(error.code, error.message) === "rateLimited")
    return fail("rateLimited");
  return ok();
}

export async function updatePassword(raw: unknown, localeRaw: string): Promise<ActionResult> {
  const locale = asLocale(localeRaw);
  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return fail("linkExpired");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(authErrorKey(error.code, error.message));
  redirect({ href: "/app", locale });
  return ok();
}

export async function signOut(localeRaw: string) {
  const locale = asLocale(localeRaw);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: "/", locale });
}
