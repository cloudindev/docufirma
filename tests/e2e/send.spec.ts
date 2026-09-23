import { expect, test } from "@playwright/test";
import { registerAndOnboard, uniqueEmail } from "./helpers/auth";
import { extractSignLink, waitForEmail } from "./helpers/outbox";

test.describe("send wizard", () => {
  test.skip(!process.env.E2E_WITH_BACKEND, "requires a Supabase backend (pnpm stack:up)");

  test("upload two PDFs, add a signer and send", async ({ page }) => {
    await registerAndOnboard(page, { firstName: "Sara" });
    await page.goto("/es/app/send");
    await page
      .locator("#wizard-files")
      .setInputFiles(["tests/fixtures/contrato.pdf", "tests/fixtures/anexo.pdf"]);
    await expect(page.getByText("contrato.pdf")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("anexo.pdf")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("3 páginas")).toBeVisible();
    await expect(page).toHaveURL(/\/es\/app\/send\/[0-9a-f-]{36}$/);

    await page.getByRole("button", { name: "Continuar" }).click();
    const signerEmail = uniqueEmail("signer");
    await page.locator("#s-0-first").fill("Lucía");
    await page.locator("#s-0-last").fill("Gómez");
    await page.locator("#s-0-email").fill(signerEmail);
    await page.locator("#w-title").fill("Contrato e2e");
    await page.locator("#w-message").fill("Hola Lucía, aquí tienes el contrato.");
    await page.getByRole("button", { name: "Revisar envío" }).click();

    await expect(
      page.getByText("Este envío consumirá 1 firma de tus 3 disponibles."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Enviar para firmar" }).click();
    await expect(page).toHaveURL(/\/es\/app\/envelopes\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Contrato e2e" })).toBeVisible();
    await expect(page.getByText("Enviado", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^DF-[0-9A-Z]{4}-[0-9A-Z]{4}$/)).toBeVisible();

    const email = await waitForEmail(signerEmail, "signer-invitation");
    expect(email.subject).toContain("Contrato e2e");
    expect(extractSignLink(email)).toMatch(/^\/es\/sign\/[A-Za-z0-9_-]{43}$/);

    // Credits: 1 reserved → 2 left
    await expect(page.getByText("2 firmas disponibles").first()).toBeVisible();

    // The signer was saved as a contact
    await page.goto("/es/app/contacts");
    await expect(page.getByRole("cell", { name: signerEmail })).toBeVisible();
  });

  test("validation: duplicate emails and missing signer", async ({ page }) => {
    await registerAndOnboard(page);
    await page.goto("/es/app/send");
    await page.locator("#wizard-files").setInputFiles(["tests/fixtures/dni.png"]);
    await expect(page.getByText("dni.pdf")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Revisar envío" }).click();
    await expect(page.getByText("Este campo es obligatorio.").first()).toBeVisible();
    await page.locator("#s-0-first").fill("A");
    await page.locator("#s-0-last").fill("B");
    await page.locator("#s-0-email").fill("dup@example.com");
    await page.getByRole("button", { name: "Añadir firmante" }).click();
    await page.locator("#s-1-first").fill("C");
    await page.locator("#s-1-last").fill("D");
    await page.locator("#s-1-email").fill("dup@example.com");
    await page.getByRole("button", { name: "Revisar envío" }).click();
    await expect(page.getByText("Este email ya está en la lista de firmantes.")).toBeVisible();
  });
});
