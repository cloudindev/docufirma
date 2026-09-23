import { expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers/auth";

/**
 * An expired access token is refreshed by the proxy; the refreshed cookies must reach the page
 * render. Run with a short token lifetime on the local stack:
 *   LOCAL_JWT_EXP=120 pnpm stack:up   and   E2E_JWT_EXP_SECONDS=120 pnpm test:e2e
 * (supabase-js refreshes tokens that expire within 90 s, so shorter lifetimes refresh on every call.)
 */
const expSeconds = Number(process.env.E2E_JWT_EXP_SECONDS ?? 0);

test.describe("session refresh", () => {
  test.skip(!process.env.E2E_WITH_BACKEND || !expSeconds, "needs a short-lived JWT stack");
  test.skip(({ isMobile }) => isMobile, "desktop only");

  test("the private area still loads after the access token expires", async ({ page }) => {
    test.setTimeout(90_000 + expSeconds * 2_000);
    await registerAndOnboard(page);
    await page.waitForTimeout((expSeconds + 5) * 1_000);

    const response = await page.goto("/es/app");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/es\/app$/);
    await expect(page.getByRole("link", { name: "Nuevo envío" }).first()).toBeVisible();

    // A second expiry cycle, now with the already-refreshed cookies.
    await page.waitForTimeout((expSeconds + 5) * 1_000);
    await page.goto("/es/app/envelopes");
    await expect(page).toHaveURL(/\/es\/app\/envelopes$/);
  });
});
