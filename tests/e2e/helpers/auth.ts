import { expect, type Page } from "@playwright/test";

export const uniqueEmail = (prefix = "e2e") =>
  `${prefix}+${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`;

/** Registers a user (local stack auto-confirms emails) and completes onboarding. */
export async function registerAndOnboard(
  page: Page,
  opts: { firstName?: string; lastName?: string; email?: string } = {},
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
  return { email, password: "Password123" };
}
