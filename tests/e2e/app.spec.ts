import { expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers/auth";

test.describe("private area", () => {
  test.skip(!process.env.E2E_WITH_BACKEND, "requires a Supabase backend (pnpm stack:up)");

  test("dashboard, contacts and settings", async ({ page, isMobile }) => {
    await registerAndOnboard(page, { firstName: "Clara" });
    await expect(page.getByRole("heading", { name: "Hola, Clara" })).toBeVisible();
    await expect(page.getByText("Aún no has enviado ningún documento")).toBeVisible();
    await expect(page.getByText("5 firmas disponibles").first()).toBeVisible();

    // Contacts CRUD
    await page.goto("/es/app/contacts");
    await page.getByRole("button", { name: "Añadir contacto" }).first().click();
    await page.locator("#c-first").fill("Pedro");
    await page.locator("#c-last").fill("Ruiz");
    await page.locator("#c-email").fill("pedro@example.com");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("cell", { name: /Pedro Ruiz/ })).toBeVisible();
    await page.getByRole("button", { name: "Añadir contacto" }).first().click();
    await page.locator("#c-first").fill("Otro");
    await page.locator("#c-last").fill("Pedro");
    await page.locator("#c-email").fill("PEDRO@example.com");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Ya tienes un contacto con ese email.")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Eliminar Pedro" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByText("Aún no tienes contactos")).toBeVisible();

    // Settings
    await page.goto("/es/app/settings");
    await page.locator("#p-company").fill("Clara Legal SL");
    await page.locator("#p-tax").fill("b12345678");
    await page.getByRole("button", { name: "Guardar cambios" }).first().click();
    await expect(page.getByText("Perfil actualizado.")).toBeVisible();
    await page.reload();
    await expect(page.locator("#p-tax")).toHaveValue("B12345678");

    // Automatic top-up of SMS: minimum 5, 500 SMS pack.
    const smsForm = page.locator("form[aria-labelledby='ar-sms-title']");
    await expect(page.getByRole("heading", { name: "Recarga automática" })).toBeVisible();
    await expect(page.locator("#ar-sms-threshold")).toBeDisabled();
    await page.locator("#ar-sms-enabled").click();
    await page.locator("#ar-sms-threshold").fill("5");
    await page.locator("#ar-sms-pack").selectOption("sms-500");
    await smsForm.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Recarga automática guardada.")).toBeVisible();
    await page.reload();
    await expect(page.locator("#ar-sms-enabled")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#ar-sms-threshold")).toHaveValue("5");
    await expect(page.locator("#ar-sms-pack")).toHaveValue("sms-500");
    await expect(page.locator("#ar-signatures-enabled")).toHaveAttribute("aria-checked", "false");

    // Envelopes list empty + filters
    await page.goto("/es/app/envelopes?status=completed");
    await expect(page.getByText("No hay envíos", { exact: true })).toBeVisible();
    if (!isMobile)
      await expect(page.getByRole("tab", { name: "Firmados" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
  });
});
