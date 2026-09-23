import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers/auth";
import { extractSignLink, waitForEmail } from "./helpers/outbox";
import { sendEnvelope } from "./helpers/send";
import { drawSignature, readAllDocuments } from "./helpers/sign";

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

test.describe("envelope lifecycle", () => {
  test.skip(!process.env.E2E_WITH_BACKEND, "requires a Supabase backend (pnpm stack:up)");
  test.skip(({ isMobile }) => isMobile, "desktop only");

  test("expiration via cron releases the credits", async ({ page, request }) => {
    const { email } = await registerAndOnboard(page);
    const { envelopeUrl, signers } = await sendEnvelope(page, {
      files: ["tests/fixtures/anexo.pdf"],
    });
    const envelopeId = envelopeUrl.split("/").pop()!;
    await expect(page.getByText("2 firmas disponibles").first()).toBeVisible();
    const link = extractSignLink(await waitForEmail(signers[0]!.email, "signer-invitation"));

    const past = new Date(Date.now() - 60_000).toISOString();
    await admin().from("envelopes").update({ expires_at: past }).eq("id", envelopeId);

    expect((await request.get("/api/cron/expire")).status()).toBe(401);
    const res = await request.get("/api/cron/expire", {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).expired).toBeGreaterThanOrEqual(1);

    await page.reload();
    await expect(page.getByText("Caducado", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("3 firmas disponibles").first()).toBeVisible();
    expect((await waitForEmail(email, "envelope-expired")).subject).toContain("caducado");

    await page.goto(link);
    await expect(page.getByRole("heading", { name: "El enlace ha caducado" })).toBeVisible();
  });

  test("sequential signing notifies the next signer only after the first signs", async ({
    page,
    browser,
    baseURL,
  }) => {
    await registerAndOnboard(page);
    const { signers, envelopeUrl } = await sendEnvelope(page, {
      files: ["tests/fixtures/anexo.pdf"],
      signers: [
        { first: "Primera", last: "Firmante" },
        { first: "Segundo", last: "Firmante" },
      ],
      sequential: true,
    });
    await expect(page.getByText("Firma en orden")).toBeVisible();
    const first = extractSignLink(await waitForEmail(signers[0]!.email, "signer-invitation"));
    await expect(waitForEmail(signers[1]!.email, "signer-invitation", 2_000)).rejects.toThrow();

    const ctx = await browser.newContext({ baseURL, locale: "es-ES" });
    const p1 = await ctx.newPage();
    await p1.goto(first);
    await readAllDocuments(p1);
    await p1.getByRole("button", { name: "Continuar a la firma" }).click();
    await p1.getByRole("checkbox").check();
    await drawSignature(p1);
    await p1.getByRole("button", { name: "Firmar documento" }).click();
    await expect(p1.getByText(/Cuando firmen el resto de personas/)).toBeVisible({
      timeout: 30_000,
    });

    const second = extractSignLink(
      await waitForEmail(signers[1]!.email, "signer-invitation", 20_000),
    );
    const p2 = await ctx.newPage();
    await p2.goto(second);
    await readAllDocuments(p2);
    await p2.getByRole("button", { name: "Continuar a la firma" }).click();
    await p2.getByRole("checkbox").check();
    await drawSignature(p2);
    await p2.getByRole("button", { name: "Firmar documento" }).click();
    await expect(p2.getByRole("link", { name: /PDF firmado/ })).toBeVisible({ timeout: 60_000 });
    await ctx.close();

    await page.goto(envelopeUrl);
    await expect(page.getByText("Firmado", { exact: true }).first()).toBeVisible();
  });
});
