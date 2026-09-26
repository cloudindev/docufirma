import { expect, type Page } from "@playwright/test";
import { uniqueEmail } from "./auth";

/** Creates and sends an envelope from the wizard. Returns the signer emails and the envelope URL. */
export async function sendEnvelope(
  page: Page,
  opts: {
    files?: string[];
    signers?: {
      first: string;
      last: string;
      email?: string;
      phone?: string;
      sms?: boolean;
      inPerson?: boolean;
    }[];
    title?: string;
    sequential?: boolean;
  } = {},
) {
  const files = opts.files ?? ["tests/fixtures/contrato.pdf", "tests/fixtures/anexo.pdf"];
  const signers = (opts.signers ?? [{ first: "Lucía", last: "Gómez" }]).map((s) => ({
    ...s,
    email: s.email ?? uniqueEmail("signer"),
  }));
  await page.goto("/es/app/send");
  await page.locator("#wizard-files").setInputFiles(files);
  for (const f of files) {
    const base = f
      .split("/")
      .pop()!
      .replace(/\.(png|jpe?g|webp)$/i, ".pdf");
    await expect(page.getByText(base, { exact: true })).toBeVisible({ timeout: 30_000 });
  }
  await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Continuar" }).click();
  for (const [i, s] of signers.entries()) {
    if (i > 0) await page.getByRole("button", { name: "Añadir firmante" }).click();
    await page.locator(`#s-${i}-first`).fill(s.first);
    await page.locator(`#s-${i}-last`).fill(s.last);
    await page.locator(`#s-${i}-email`).fill(s.email);
    if (s.phone) await page.locator(`#s-${i}-phone`).fill(s.phone);
    if (s.inPerson) await page.locator(`#s-${i}-in-person`).click();
    if (s.sms) await page.locator(`#s-${i}-sms`).click();
  }
  if (opts.sequential) await page.locator("#w-sequential").click();
  if (opts.title) await page.locator("#w-title").fill(opts.title);
  await page.getByRole("button", { name: "Revisar envío" }).click();
  await page.getByRole("button", { name: "Enviar para firmar" }).click();
  await expect(page).toHaveURL(/\/es\/app\/envelopes\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  return { signers, envelopeUrl: page.url() };
}
