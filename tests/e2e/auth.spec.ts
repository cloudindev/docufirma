import { expect, test } from "@playwright/test";

const uniqueEmail = () => `e2e+${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;

test.describe("authentication", () => {
  test.skip(!process.env.E2E_WITH_BACKEND, "requires a Supabase backend (pnpm stack:up)");

  test("register → onboarding → dashboard, then log out and log in", async ({ page }) => {
    const email = uniqueEmail();
    await page.goto("/es/registro");
    await page.getByLabel("Nombre", { exact: true }).fill("Ana");
    await page.getByLabel("Apellidos").fill("Martín");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill("Password123");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(page).toHaveURL(/\/es\/app\/onboarding/);
    await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Ana");
    await page.getByLabel("Empresa").fill("Martín Asesores");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("radio", { name: /English/ }).click();
    await page.getByRole("radio", { name: /Español/ }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Ir al panel" }).click();
    await expect(page).toHaveURL(/\/es\/app$/);

    // Protected route without session redirects to login with ?next
    await page.context().clearCookies();
    await page.goto("/es/app");
    await expect(page).toHaveURL(/\/es\/iniciar-sesion\?next=%2Fes%2Fapp/);

    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill("wrong-password1");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page.getByText("Email o contraseña incorrectos.")).toBeVisible();

    await page.locator("#login-password").fill("Password123");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/es\/app$/);
  });

  test("validation messages are translated", async ({ page }) => {
    await page.goto("/en/register");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("This field is required.").first()).toBeVisible();
    await expect(page.getByText("You must accept the terms to continue.")).toBeVisible();
  });
});
