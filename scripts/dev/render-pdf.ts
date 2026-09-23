/**
 * Renders PDF pages to PNG with pdf.js inside Chromium (visual QA of generated PDFs).
 *   pnpm tsx scripts/dev/render-pdf.ts file.pdf out-prefix [pages=1,2]
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const [file, out, pagesArg] = process.argv.slice(2);
  if (!file || !out) throw new Error("usage: render-pdf <file.pdf> <out-prefix> [pages]");
  const pdfjsDir = join(process.cwd(), "node_modules/pdfjs-dist/legacy/build");
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ["--allow-file-access-from-files"],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await page.goto(`file://${pdfjsDir}/pdf.mjs`); // same-origin file:// context
  const b64 = readFileSync(file).toString("base64");
  const count = await page.evaluate(
    async ({ b64, dir }) => {
      const pdfjs = await import(`file://${dir}/pdf.mjs`);
      pdfjs.GlobalWorkerOptions.workerSrc = `file://${dir}/pdf.worker.mjs`;
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const doc = await pdfjs.getDocument({ data }).promise;
      document.body.innerHTML = "";
      document.body.style.margin = "0";
      document.body.style.background = "#888";
      for (let i = 1; i <= doc.numPages; i++) {
        const p = await doc.getPage(i);
        const vp = p.getViewport({ scale: 1.4 });
        const c = document.createElement("canvas");
        c.id = `p${i}`;
        c.width = vp.width;
        c.height = vp.height;
        c.style.display = "block";
        c.style.margin = "10px auto";
        document.body.appendChild(c);
        await p.render({ canvas: c, viewport: vp }).promise;
      }
      return doc.numPages;
    },
    { b64, dir: pdfjsDir },
  );
  const wanted = pagesArg
    ? pagesArg.split(",").map(Number)
    : Array.from({ length: count }, (_, i) => i + 1);
  for (const n of wanted) {
    await page.locator(`#p${n}`).screenshot({ path: `${out}-p${n}.png` });
    console.log(`${out}-p${n}.png`);
  }
  await browser.close();
}
void main();
