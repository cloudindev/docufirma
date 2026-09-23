import { expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers/auth";

test.describe("private area", () => {
  test.skip(!process.env.E2E_WITH_BACKEND, "requires a Supabase backend (pnpm stack:up)");

  test("dashboard, contacts and settings", async ({ page, isMobile }) => {
    await registerAndOnboard(page, { firstName: "Clara" });
    await expect(page.getByRole("heading", { name: "Hola, Clara" })).toBeVisible();
    await expect(page.getByText("Aún no has enviado ningún documento")).toBeVisible();
    await expect(page.getByText("3 firmas disponibles").first()).toBeVisible();

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
