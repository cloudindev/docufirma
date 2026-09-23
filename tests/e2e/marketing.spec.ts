import { expect, test } from "@playwright/test";

test.describe("public site", () => {
  test("landing renders hero, pricing and FAQ in Spanish", async ({ page }) => {
    await page.goto("/es");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Firma electrónica avanzada",
    );
    await expect(
      page.getByRole("heading", { name: "Un único plan. Sin sorpresas." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "¿Cómo se cuenta una firma?" }).click();
    await expect(page.getByText("Un envío con tres firmantes consume tres firmas.")).toBeVisible();
  });

  test("localized routes and language switch", async ({ page, isMobile }) => {
    await page.goto("/es/precios");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Un único plan. Sin sorpresas.",
    );
    if (isMobile) await page.getByRole("button", { name: "Abrir menú" }).click();
    await page
      .getByRole("button", { name: /Idioma|ES/ })
      .last()
      .click();
    await page.getByRole("menuitem", { name: "English" }).click();
    await expect(page).toHaveURL(/\/en\/pricing$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("One plan. No surprises.");
  });

  test("legal pages and SEO endpoints", async ({ page, request }) => {
    await page.goto("/en/legal/signature-policy");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Electronic signature policy");
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    expect(await sitemap.text()).toContain("/es/precios");
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toContain("Disallow: /es/app");
  });

  test("verify page validates the code format", async ({ page }) => {
    await page.goto("/es/verificar");
    await page.locator("#verify-code").fill("XYZ");
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByText("Introduce un código con el formato DF-XXXX-XXXX.")).toBeVisible();
  });
});
