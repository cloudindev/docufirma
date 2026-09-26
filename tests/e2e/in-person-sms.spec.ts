import { readdirSync } from "node:fs";
import { join } from "node:path";
import { devices, expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers/auth";
import { extractSignLink, waitForEmail } from "./helpers/outbox";
import { sendEnvelope } from "./helpers/send";
import { drawSignature, readAllDocuments } from "./helpers/sign";
import { waitForSmsCode } from "./helpers/sms";

const randomMobile = () => `6${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const outboxHas = (email: string, tag: string) => {
  const dir = process.env.EMAIL_OUTBOX_DIR ?? join(process.cwd(), ".local-stack", "mail");
  const safe = email.replace(/[^a-z0-9@._+-]/gi, "_");
  return readdirSync(dir).some((f) => f.includes(`__${tag}__${safe}`));
};

test.describe("in-person signing and SMS codes", () => {
  test.skip(!process.env.E2E_WITH_BACKEND, "requires a Supabase backend (pnpm stack:up)");
  test.skip(({ isMobile }) => isMobile, "desktop sender flow");

  test("in person + SMS: the host starts the session, the signer confirms the code and signs", async ({
    page,
  }) => {
    await registerAndOnboard(page, { firstName: "Hana" });
    const mobile = randomMobile();
    const { signers, envelopeUrl } = await sendEnvelope(page, {
      files: ["tests/fixtures/contrato.pdf"],
      title: "Contrato presencial",
      signers: [{ first: "Pedro", last: "Presencial", phone: mobile, sms: true, inPerson: true }],
    });
    const email = signers[0]!.email;

    // No invitation email for in-person signers.
    await page.waitForTimeout(1_000);
    expect(outboxHas(email, "signer-invitation")).toBe(false);

    await expect(page.getByText("Presencial", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Firmar ahora: Pedro Presencial" }).click();
    await expect(page).toHaveURL(/\/es\/sign\//, { timeout: 20_000 });
    await expect(
      page.getByText(/Firma presencial: esta pantalla es para Pedro Presencial/),
    ).toBeVisible();

    await readAllDocuments(page);
    await page.getByRole("button", { name: "Continuar a la firma" }).click();

    // The pad is hidden until the SMS code is confirmed.
    await expect(page.getByTestId("signature-pad")).toHaveCount(0);
    const before = Date.now();
    await page.getByRole("button", { name: "Enviar código por SMS" }).click();
    await expect(page.getByText(/Te hemos enviado un código al \+34 ••• ••• /)).toBeVisible();
    const code = await waitForSmsCode(`+34${mobile}`, before - 1_000);

    await page.getByLabel("Código de verificación").fill(code === "000000" ? "111111" : "000000");
    await page.getByRole("button", { name: "Verificar y continuar" }).click();
    await expect(page.getByText(/Te quedan 4 intentos/)).toBeVisible();

    await page.getByLabel("Código de verificación").fill(code);
    await page.getByRole("button", { name: "Verificar y continuar" }).click();
    await expect(page.getByTestId("signature-pad")).toBeVisible();

    await page.getByRole("checkbox").check();
    await drawSignature(page);
    await page.getByRole("button", { name: "Firmar documento" }).click();
    await expect(page.getByRole("heading", { name: "¡Documento firmado!" })).toBeVisible({
      timeout: 60_000,
    });

    // Back to the envelope as the host.
    await page.getByRole("link", { name: "Volver al envío" }).click();
    await expect(page).toHaveURL(envelopeUrl);
    await expect(page.getByText("Código SMS confirmado").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Firma presencial iniciada").first()).toBeVisible();

    // The signer still receives the signed copy by email.
    const done = await waitForEmail(email, "envelope-completed-signer", 60_000);
    expect(done.subject).toContain("firmado y sellado");
  });

  test("remote + SMS: the link alone is not enough to sign", async ({ page, browser, baseURL }) => {
    await registerAndOnboard(page);
    const mobile = randomMobile();
    const { signers } = await sendEnvelope(page, {
      files: ["tests/fixtures/contrato.pdf"],
      signers: [{ first: "Rita", last: "Remota", phone: mobile, sms: true }],
    });
    const link = extractSignLink(await waitForEmail(signers[0]!.email, "signer-invitation"));

    const phone = await browser.newContext({ ...devices["Pixel 7"], baseURL, locale: "es-ES" });
    const signer = await phone.newPage();
    await signer.goto(link);
    await readAllDocuments(signer);
    await signer.getByRole("button", { name: "Continuar a la firma" }).click();
    await expect(signer.getByRole("heading", { name: "Verifica tu móvil" })).toBeVisible();
    await expect(signer.getByTestId("signature-pad")).toHaveCount(0);

    const before = Date.now();
    await signer.getByRole("button", { name: "Enviar código por SMS" }).click();
    const code = await waitForSmsCode(`+34${mobile}`, before - 1_000);
    await signer.getByLabel("Código de verificación").fill(code);
    await signer.getByRole("button", { name: "Verificar y continuar" }).click();
    await expect(signer.getByTestId("signature-pad")).toBeVisible();
    await signer.getByRole("checkbox").check();
    await drawSignature(signer);
    await signer.getByRole("button", { name: "Firmar documento" }).click();
    await expect(signer.getByRole("heading", { name: "¡Documento firmado!" })).toBeVisible({
      timeout: 60_000,
    });
    await phone.close();
  });
});
