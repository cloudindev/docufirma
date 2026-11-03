import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { registerAndOnboard, uniqueEmail } from "./helpers/auth";

/**
 * Public API end to end: key created in Settings, envelopes created/sent/canceled through the
 * API, files and events, Pro-only access, revocation and signed webhooks to a local receiver.
 * Needs WEBHOOK_ALLOW_PRIVATE=1 on the server (local receiver over http).
 */
type Received = {
  body: string;
  signature: string;
  event: { type: string; data: Record<string, unknown> };
};

test.describe("public API", () => {
  test.skip(!process.env.E2E_WITH_BACKEND, "requires a Supabase backend (pnpm stack:up)");
  test.skip(({ isMobile }) => isMobile, "desktop only");

  let server: Server;
  const received: Received[] = [];
  let hookUrl = "";

  test.beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({
          body,
          signature: String(req.headers["docufirma-signature"] ?? ""),
          event: JSON.parse(body),
        });
        res.writeHead(200).end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  });
  test.afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const waitForEvent = async (type: string) => {
    await expect
      .poll(() => received.some((r) => r.event.type === type), { timeout: 20_000 })
      .toBe(true);
    return received.find((r) => r.event.type === type)!;
  };

  const api = (request: APIRequestContext, key: string) => {
    const headers = { Authorization: `Bearer ${key}` };
    return {
      get: (path: string) => request.get(`/api/v1${path}`, { headers }),
      post: (path: string, data?: unknown) => request.post(`/api/v1${path}`, { headers, data }),
      patch: (path: string, data: unknown) => request.patch(`/api/v1${path}`, { headers, data }),
      delete: (path: string) => request.delete(`/api/v1${path}`, { headers }),
    };
  };

  test("keys, envelopes, files, webhooks and access rules", async ({ page, request }) => {
    const { email } = await registerAndOnboard(page, { firstName: "Iris" });

    // Key from Settings (shown once).
    await page.goto("/es/app/settings");
    await page.locator("#api-key-name").fill("Integración e2e");
    await page.getByRole("button", { name: "Crear clave" }).click();
    const key = await page.locator("#api-key-value").inputValue();
    expect(key).toMatch(/^df_live_[A-Za-z0-9_-]{32}$/);
    await page.reload();
    await expect(page.locator("#api-key-value")).toHaveCount(0);
    await expect(page.getByText(`${key.slice(0, 12)}…`)).toBeVisible();

    // Webhook to the local receiver + test ping with a valid signature.
    await page.locator("#wh-url").fill(hookUrl);
    await page.getByRole("button", { name: "Guardar webhook" }).click();
    await expect(page.getByText("Webhook guardado.")).toBeVisible();
    await page.getByRole("button", { name: "Mostrar", exact: true }).click();
    const secret = await page.locator("#wh-secret").inputValue();
    expect(secret).toMatch(/^dfwh_/);
    await page.getByRole("button", { name: "Enviar prueba" }).click();
    const ping = await waitForEvent("ping");
    const { t, v1 } = Object.fromEntries(ping.signature.split(",").map((p) => p.split("=")));
    expect(createHmac("sha256", secret).update(`${t}.${ping.body}`).digest("hex")).toBe(v1);

    const client = api(request, key);

    // Authentication errors.
    expect((await request.get("/api/v1/account")).status()).toBe(401);
    const bad = await api(request, `df_live_${"x".repeat(32)}`).get("/account");
    expect(bad.status()).toBe(401);
    expect((await bad.json()).error.code).toBe("invalid_api_key");

    // Account.
    const account = await client.get("/account");
    expect(account.status()).toBe(200);
    expect(account.headers()["x-ratelimit-limit"]).toBe("120");
    expect(await account.json()).toMatchObject({
      object: "account",
      email,
      plan: { active: true },
      signatures: { available: 5, reserved: 0 },
    });

    // Validation error.
    const invalid = await client.post("/envelopes", { title: "", signers: [{ email: "nope" }] });
    expect(invalid.status()).toBe(422);
    expect((await invalid.json()).error.code).toBe("validation_error");

    // Create + send in one call with an inline document.
    const signerEmail = uniqueEmail("api-signer");
    const created = await client.post("/envelopes", {
      title: "Contrato API",
      message: "Hola Lucía",
      signers: [{ first_name: "Lucía", last_name: "Gómez", email: signerEmail }],
      documents: [
        {
          name: "contrato.pdf",
          content_base64: readFileSync("tests/fixtures/contrato.pdf").toString("base64"),
        },
      ],
      send: true,
    });
    expect(created.status()).toBe(201);
    const envelope = await created.json();
    expect(envelope).toMatchObject({ object: "envelope", status: "sent", title: "Contrato API" });
    expect(envelope.verification_code).toMatch(/^DF-/);
    expect(envelope.signers[0]).toMatchObject({ email: signerEmail, status: "sent" });
    expect(envelope.documents[0]).toMatchObject({ name: "contrato.pdf" });
    const sent = await waitForEvent("envelope.sent");
    expect((sent.event.data.envelope as { id: string }).id).toBe(envelope.id);

    // Read back, list, files and events.
    expect((await (await client.get(`/envelopes/${envelope.id}`)).json()).id).toBe(envelope.id);
    const list = await (await client.get("/envelopes?status=sent&limit=5")).json();
    expect(list.data.map((e: { id: string }) => e.id)).toContain(envelope.id);
    const files = await (await client.get(`/envelopes/${envelope.id}/files`)).json();
    expect(files.data[0]).toMatchObject({ type: "original", name: "contrato.pdf" });
    expect(files.data[0].url).toMatch(/^https?:\/\//);
    const events = await (await client.get(`/envelopes/${envelope.id}/events`)).json();
    expect(events.data.map((e: { type: string }) => e.type)).toEqual(
      expect.arrayContaining(["created", "sent"]),
    );
    expect((await (await client.get("/account")).json()).signatures).toMatchObject({
      available: 4,
      reserved: 1,
    });

    // Drafts: update and delete; sent envelopes cannot be modified.
    const draft = await (await client.post("/envelopes", { title: "Borrador API" })).json();
    expect(draft.status).toBe("draft");
    const patched = await client.patch(`/envelopes/${draft.id}`, {
      title: "Borrador renombrado",
      reminder_days: 0,
    });
    expect(await patched.json()).toMatchObject({ title: "Borrador renombrado", reminder_days: 0 });
    const noDocs = await client.post(`/envelopes/${draft.id}/send`);
    expect(noDocs.status()).toBe(422);

    // Large-file flow: signed upload URL → PUT → complete.
    const pdf = readFileSync("tests/fixtures/anexo.pdf");
    const slot = await (
      await client.post(`/envelopes/${draft.id}/uploads`, {
        name: "anexo.pdf",
        size_bytes: pdf.byteLength,
      })
    ).json();
    expect(slot).toMatchObject({ object: "upload", method: "PUT" });
    const put = await request.put(slot.upload_url, {
      headers: { "Content-Type": "application/pdf" },
      data: pdf,
    });
    expect(put.ok()).toBeTruthy();
    const added = await client.post(`/envelopes/${draft.id}/uploads/${slot.id}/complete`, {
      name: "anexo.pdf",
    });
    expect(added.status()).toBe(201);
    expect(await added.json()).toMatchObject({
      object: "document",
      name: "anexo.pdf",
      page_count: 1,
    });
    expect((await client.delete(`/envelopes/${draft.id}`)).status()).toBe(200);
    expect((await client.get(`/envelopes/${draft.id}`)).status()).toBe(404);
    const locked = await client.patch(`/envelopes/${envelope.id}`, { title: "x" });
    expect(locked.status()).toBe(409);

    // Cancel → signature returned, webhook.
    const canceled = await client.post(`/envelopes/${envelope.id}/cancel`);
    expect((await canceled.json()).status).toBe("canceled");
    await waitForEvent("envelope.canceled");
    expect((await (await client.get("/account")).json()).signatures).toMatchObject({
      available: 5,
      reserved: 0,
    });

    // Pro only: without an active plan the key stops working.
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
      },
    );
    const { data: profile } = await admin.from("profiles").select("id").eq("email", email).single();
    await admin.from("subscriptions").update({ status: "canceled" }).eq("user_id", profile!.id);
    const noPlan = await client.get("/account");
    expect(noPlan.status()).toBe(403);
    expect((await noPlan.json()).error.code).toBe("subscription_required");
    await admin.from("subscriptions").update({ status: "active" }).eq("user_id", profile!.id);

    // Revoked keys are rejected.
    await page.reload();
    await page.getByRole("button", { name: "Revocar la clave Integración e2e" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Revocar" }).click();
    await expect(page.getByText("Clave revocada.")).toBeVisible();
    expect((await client.get("/account")).status()).toBe(401);
  });

  test("docs page and OpenAPI are public, and linked from the footer", async ({
    page,
    request,
  }) => {
    await page.goto("/es");
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "API para desarrolladores" })
      .click();
    await expect(page).toHaveURL(/\/es\/desarrolladores$/);
    await expect(page.getByRole("heading", { level: 1, name: "API de DocuFirma" })).toBeVisible();
    const spec = await (await request.get("/api/v1/openapi.json")).json();
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths)).toContain("/envelopes");
  });
});
