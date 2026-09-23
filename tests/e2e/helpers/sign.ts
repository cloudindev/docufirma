import { expect, type Page } from "@playwright/test";

/** Scrolls every document of the signer view to the end. */
export async function readAllDocuments(page: Page) {
  const tabs = page.getByRole("tab");
  const count = await tabs.count();
  for (let i = 0; i < Math.max(1, count); i++) {
    if (count > 0) await tabs.nth(i).click();
    const viewer = page.locator('[role="document"]:visible');
    await expect(viewer.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
    for (let k = 0; k < 12; k++) {
      await viewer.evaluate((el) => el.scrollBy(0, el.clientHeight));
      await page.waitForTimeout(120);
    }
    await viewer.evaluate((el) => (el.scrollTop = el.scrollHeight));
  }
  await expect(page.getByText(/Has revisado todos los documentos/)).toBeVisible({
    timeout: 15_000,
  });
}

/** Draws a realistic signature (3 strokes, ~1 s) on the pad with the mouse. */
export async function drawSignature(page: Page) {
  const pad = page.getByTestId("signature-pad");
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  const strokes = [
    (t: number) => ({ x: 0.1 + 0.3 * t, y: 0.6 - 0.35 * Math.sin(t * Math.PI) }),
    (t: number) => ({ x: 0.42 + 0.25 * t, y: 0.35 + 0.3 * Math.sin(t * Math.PI * 2) }),
    (t: number) => ({ x: 0.7 + 0.2 * t, y: 0.55 - 0.1 * t }),
  ];
  for (const f of strokes) {
    const start = f(0);
    await page.mouse.move(box.x + start.x * box.width, box.y + start.y * box.height);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      const p = f(i / 20);
      await page.mouse.move(box.x + p.x * box.width, box.y + p.y * box.height);
      await page.waitForTimeout(15);
    }
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
}
