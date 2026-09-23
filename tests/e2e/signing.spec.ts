import { createHash } from "node:crypto";
import { devices, expect, type Page, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers/auth";
import { extractSignLink, waitForEmail } from "./helpers/outbox";
import { sendEnvelope } from "./helpers/send";
import { drawSignature, readAllDocuments } from "./helpers/sign";

const shot = async (page: Page, name: string) => {
  if (process.env.E2E_SCREENSHOTS)
    await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: false });
};

test.describe("signing flow", () => {
  test.skip(!process.env.E2E_WITH_BACKEND, "requires a Supabase backend (pnpm stack:up)");
  test.skip(
    ({ isMobile }) => isMobile,
    "the sender part runs on desktop; the signer uses an emulated phone",
  );

  test("send → sign on mobile → completed → download → verify", async ({
    page,
    browser,
    baseURL,
  }) => {
    await registerAndOnboard(page, { firstName: "Sara" });
    const { signers, envelopeUrl } = await sendEnvelope(page, { title: "Contrato firma e2e" });
    const link = extractSignLink(await waitForEmail(signers[0]!.email, "signer-invitation"));

    // Signer on an emulated phone, in a separate browser context (no sender session).
    const phone = await browser.newContext({ ...devices["Pixel 7"], baseURL, locale: "es-ES" });
    const signerPage = await phone.newPage();
    await signerPage.goto(link);
    await expect(signerPage.getByRole("heading", { level: 1 })).toContainText(
      "te ha enviado 2 documentos para firmar",
    );
    await expect(signerPage.getByRole("button", { name: "Continuar a la firma" })).toBeDisabled();
    await shot(signerPage, "sign-1-review-mobile");
    await readAllDocuments(signerPage);
    await signerPage.getByRole("button", { name: "Continuar a la firma" }).click();

    await expect(signerPage.getByRole("button", { name: "Firmar documento" })).toBeDisabled();
    await signerPage.getByRole("checkbox").check();
    await drawSignature(signerPage);
    await shot(signerPage, "sign-2-signature-mobile");
    await signerPage.getByRole("button", { name: "Firmar documento" }).click();
    await expect(signerPage.getByRole("heading", { name: "¡Documento firmado!" })).toBeVisible({
      timeout: 60_000,
    });
    const downloadLink = signerPage.getByRole("link", { name: /PDF firmado · contrato\.pdf/ });
    await expect(downloadLink).toBeVisible({ timeout: 60_000 });
    await expect(signerPage.getByRole("link", { name: "Certificado de evidencias" })).toBeVisible();
    await shot(signerPage, "sign-3-success-mobile");

    // Download the signed PDF and keep its hash for the public verification.
    const signedUrl = await downloadLink.getAttribute("href");
    const signedBytes = Buffer.from(await (await phone.request.get(signedUrl!)).body());
    expect(signedBytes.subarray(0, 5).toString()).toBe("%PDF-");
    const signedHash = createHash("sha256").update(signedBytes).digest("hex");

    // Reusing the link shows "already signed".
    await signerPage.goto(link);
    await expect(
      signerPage.getByRole("heading", { name: "Ya has firmado este documento" }),
    ).toBeVisible();

    // Completion email to the signer.
    const done = await waitForEmail(signers[0]!.email, "envelope-completed-signer");
    expect(done.subject).toContain("firmado y sellado");
    await phone.close();

    // Sender: completed envelope with timestamps and downloads.
    await page.goto(envelopeUrl);
    await expect(page.getByText("Firmado", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Sellado el/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "PDF firmado" }).first()).toBeVisible();
    await expect(page.getByText(/firmó$/).first()).toBeVisible();
    const code = (await page.getByText(/^DF-[0-9A-Z]{4}-[0-9A-Z]{4}$/).textContent())!.trim();

    // Public verification by code …
    await page.goto(`/es/verificar?code=${code}`);
    await expect(page.getByRole("heading", { name: "Documento verificado" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Lucía Gómez")).toBeVisible();
    await expect(page.getByRole("link", { name: "Descargar .tsr" }).first()).toBeVisible();
    // … and by uploading the signed PDF (hash computed in the browser).
    await page.getByRole("tab", { name: "Subir PDF" }).click();
    await page
      .locator("#verify-file")
      .setInputFiles({ name: "firmado.pdf", mimeType: "application/pdf", buffer: signedBytes });
    await expect(page.getByText(signedHash)).toBeVisible();
    await expect(page.getByText("Coincide con tu archivo")).toBeVisible({ timeout: 15_000 });
    // A modified file is not recognised.
    const tampered = Buffer.concat([signedBytes, Buffer.from("\n%tampered")]);
    await page
      .locator("#verify-file")
      .setInputFiles({ name: "x.pdf", mimeType: "application/pdf", buffer: tampered });
    await expect(page.getByRole("heading", { name: "No encontramos este documento" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("signer declines → envelope declined and credit returned", async ({
    page,
    browser,
    baseURL,
  }) => {
    await registerAndOnboard(page);
    const { signers, envelopeUrl } = await sendEnvelope(page, {
      files: ["tests/fixtures/anexo.pdf"],
    });
    await expect(page.getByText("2 firmas disponibles").first()).toBeVisible();
    const link = extractSignLink(await waitForEmail(signers[0]!.email, "signer-invitation"));
    const ctx = await browser.newContext({ baseURL, locale: "es-ES" });
    const signerPage = await ctx.newPage();
    await signerPage.goto(link);
    await signerPage.getByRole("button", { name: "Rechazar" }).click();
    await signerPage.locator("#decline-reason").fill("Faltan datos del contrato");
    await signerPage.getByRole("button", { name: "Rechazar firma" }).click();
    await expect(signerPage.getByText(/Has rechazado firmar/)).toBeVisible();
    await ctx.close();

    await page.goto(envelopeUrl);
    await expect(page.getByText("Rechazado", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Motivo: Faltan datos del contrato")).toBeVisible();
    await expect(page.getByText("3 firmas disponibles").first()).toBeVisible();
  });
});
