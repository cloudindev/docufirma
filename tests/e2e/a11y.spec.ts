import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers/auth";
import { extractSignLink, waitForEmail } from "./helpers/outbox";
import { sendEnvelope } from "./helpers/send";

/**
 * Accessibility (WCAG 2.1 AA via axe) and CSP hygiene: no serious/critical axe violations and
 * no console errors (CSP violations surface as console errors) on key pages.
 */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function trackConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

const publicPages = [
  "/es",
  "/en",
  "/es/precios",
  "/es/como-funciona",
  "/es/verificar",
  "/es/legal/privacy",
  "/es/iniciar-sesion",
  "/es/registro",
];

test.describe("public pages", () => {
  for (const path of publicPages) {
    test(`a11y + no console errors: ${path}`, async ({ page }) => {
      const errors = trackConsoleErrors(page);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectAccessible(page);
      expect(errors).toEqual([]);
    });
  }
});

test.describe("authenticated app and signer view", () => {
  test.skip(!process.env.E2E_WITH_BACKEND, "requires a Supabase backend (pnpm stack:up)");
  test.skip(({ isMobile }) => isMobile, "covered on desktop");

  test("dashboard, wizard and signer view are accessible under the strict CSP", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page);
    await registerAndOnboard(page);

    const response = await page.goto("/es/app");
    const csp = response?.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    await expectAccessible(page);

    await page.goto("/es/app/envelopes");
    await expectAccessible(page);

    const { signers } = await sendEnvelope(page, { title: "Sobre accesibilidad" });
    const link = extractSignLink(await waitForEmail(signers[0]!.email, "signer-invitation"));
    const signResponse = await page.goto(link);
    expect(signResponse?.headers()["content-security-policy"] ?? "").toContain("'strict-dynamic'");
    expect(signResponse?.headers()["referrer-policy"]).toBe("no-referrer");
    await page.waitForLoadState("networkidle");
    await expectAccessible(page);

    expect(errors).toEqual([]);
  });
});
