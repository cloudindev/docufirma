import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

export const uniqueEmail = (prefix = "e2e") =>
  `${prefix}+${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`;

const serviceClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

/** Gives a user an active Pro subscription (as the Stripe webhook would), required to send. */
export async function activatePro(email: string) {
  const admin = serviceClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();
  if (error || !profile) throw new Error(`No profile for ${email}`);
  const now = Date.now();
  const { error: subError } = await admin.from("subscriptions").insert({
    user_id: profile.id,
    stripe_subscription_id: `sub_e2e_${now}_${Math.random().toString(36).slice(2, 8)}`,
    status: "active",
    price_id: "price_pro_local",
    current_period_start: new Date(now).toISOString(),
    current_period_end: new Date(now + 30 * 86_400_000).toISOString(),
  });
  if (subError) throw subError;
  return profile.id as string;
}

/**
 * Registers a user (local stack auto-confirms emails) and completes onboarding. With a backend,
 * the user also gets an active Pro plan unless `plan: false` (sending requires it).
 */
export async function registerAndOnboard(
  page: Page,
  opts: { firstName?: string; lastName?: string; email?: string; plan?: boolean } = {},
) {
  const email = opts.email ?? uniqueEmail();
  await page.goto("/es/registro");
  await page.locator("#reg-first").fill(opts.firstName ?? "Ana");
  await page.locator("#reg-last").fill(opts.lastName ?? "Martín");
  await page.locator("#reg-email").fill(email);
  await page.locator("#reg-password").fill("Password123");
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/es\/app\/onboarding/);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Ir al panel" }).click();
  await expect(page).toHaveURL(/\/es\/app$/);
  if (opts.plan !== false && process.env.E2E_WITH_BACKEND && process.env.SUPABASE_SERVICE_ROLE_KEY)
    await activatePro(email);
  return { email, password: "Password123" };
}
