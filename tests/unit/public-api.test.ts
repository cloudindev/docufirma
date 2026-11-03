import { createHmac, timingSafeEqual } from "node:crypto";
import { generateApiKey, generateWebhookSecret, hashApiKey, isApiKeyFormat } from "@/lib/api/keys";
import { serializeEnvelope } from "@/lib/api/serialize";
import { assertWebhookUrl, signWebhook } from "@/lib/api/webhooks";
import type { Tables } from "@/types/database";

describe("API keys", () => {
  it("generates unique keys with a visible prefix and stores only the hash", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(isApiKeyFormat(a.key)).toBe(true);
    expect(a.prefix).toBe(a.key.slice(0, 12));
    expect(a.prefix.startsWith("df_live_")).toBe(true);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(a.key)).toBe(a.hash);
    expect(a.hash).not.toContain(a.key);
  });

  it("rejects malformed keys before touching the database", () => {
    expect(isApiKeyFormat("df_live_short")).toBe(false);
    expect(isApiKeyFormat("sk_live_" + "a".repeat(32))).toBe(false);
    expect(isApiKeyFormat(`df_live_${"a".repeat(32)}`)).toBe(true);
  });

  it("webhook secrets are long and prefixed", () => {
    expect(generateWebhookSecret()).toMatch(/^dfwh_[A-Za-z0-9_-]{40}$/);
  });
});

describe("webhook signatures", () => {
  it("can be verified with the snippet published in the docs", () => {
    const secret = generateWebhookSecret();
    const body = JSON.stringify({ id: "evt_1", type: "envelope.completed" });
    const header = signWebhook(secret, body, 1_793_790_902);
    const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("="))) as {
      t: string;
      v1: string;
    };
    expect(t).toBe("1793790902");
    const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    expect(timingSafeEqual(Buffer.from(expected), Buffer.from(v1))).toBe(true);
    // Any change to the body breaks the signature.
    expect(signWebhook(secret, `${body} `, 1_793_790_902)).not.toBe(header);
  });
});

describe("webhook URLs (SSRF)", () => {
  const prev = process.env.WEBHOOK_ALLOW_PRIVATE;
  beforeEach(() => {
    delete process.env.WEBHOOK_ALLOW_PRIVATE;
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE;
    else process.env.WEBHOOK_ALLOW_PRIVATE = prev;
  });

  it.each([
    ["http://93.184.216.34/hook", "https_required"],
    ["https://localhost/hook", "private_address"],
    ["https://127.0.0.1/hook", "private_address"],
    ["https://10.0.0.5/hook", "private_address"],
    ["https://192.168.1.10/hook", "private_address"],
    ["https://169.254.169.254/latest/meta-data", "private_address"],
    ["https://[::1]/hook", "private_address"],
    ["https://user:pass@93.184.216.34/hook", "invalid_url"],
    ["not a url", "invalid_url"],
  ])("rejects %s", async (url, code) => {
    await expect(assertWebhookUrl(url)).rejects.toThrow(code);
  });

  it("accepts public HTTPS addresses", async () => {
    await expect(assertWebhookUrl("https://93.184.216.34/hooks/docufirma")).resolves.toBeInstanceOf(
      URL,
    );
  });

  it("allows local URLs only when explicitly enabled (development and tests)", async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE = "1";
    await expect(assertWebhookUrl("http://127.0.0.1:4010/hook")).resolves.toBeInstanceOf(URL);
  });
});

describe("serialization", () => {
  it("exposes a stable public shape without internal fields", () => {
    const envelope = {
      id: "e1",
      user_id: "u1",
      status: "sent",
      title: "Contrato",
      message: null,
      locale: "es",
      sequential: false,
      expiry_days: 30,
      reminder_days: 3,
      verification_code: "DF-AAAA-BBBB",
      created_at: "2026-11-03T10:00:00Z",
      sent_at: "2026-11-03T10:00:01Z",
      expires_at: null,
      completed_at: null,
      declined_at: null,
      expired_at: null,
      canceled_at: null,
      all_signed_at: null,
      sender_name: "Ana",
      sender_email: "ana@example.com",
      sender_company: null,
      updated_at: "2026-11-03T10:00:01Z",
    } as Tables<"envelopes">;
    const out = serializeEnvelope(envelope, [], []);
    expect(out).toMatchObject({
      id: "e1",
      object: "envelope",
      status: "sent",
      signers: [],
      documents: [],
    });
    expect(out).not.toHaveProperty("user_id");
    expect(out).not.toHaveProperty("sender_email");
  });
});
