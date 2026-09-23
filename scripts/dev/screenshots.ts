/**
 * Captures full-page screenshots of the given paths (desktop + mobile) into docs/screenshots.
 *   pnpm tsx scripts/dev/screenshots.ts /es /es/precios
 */
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const out = process.env.SCREENSHOT_DIR ?? "docs/screenshots";
const paths = process.argv.slice(2);

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
  for (const [name, options] of [
    ["desktop", { viewport: { width: 1440, height: 900 } }],
    ["mobile", devices["Pixel 7"]],
  ] as const) {
    const context = await browser.newContext({ ...options, locale: "es-ES" });
    const page = await context.newPage();
    if (process.env.SCREENSHOT_EMAIL) {
      await page.goto(`${base}/es/iniciar-sesion`);
      await page.locator("#login-email").fill(process.env.SCREENSHOT_EMAIL);
      await page.locator("#login-password").fill(process.env.SCREENSHOT_PASSWORD ?? "");
      await page.locator("#login-password").press("Enter");
      await page.waitForURL(/\/app/);
    }
    for (const path of paths) {
      await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        // Trigger in-view animations by scrolling through the page.
        for (let y = 0; y < document.body.scrollHeight; y += 250) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(900);
      const file = `${out}/${path.replace(/^\//, "").replace(/\//g, "_") || "root"}-${name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
    }
    await context.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
