import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateOtp, hashOtp, otpSmsText } from "@/lib/signing/otp";
import { isSmsAvailable, sendSms, toSmsText } from "@/lib/sms";
import { maskPhone, normalizePhone } from "@/lib/validation/phone";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("phone numbers", () => {
  it.each([
    ["600 123 456", "+34600123456"],
    ["+34 600-123-456", "+34600123456"],
    ["0034600123456", "+34600123456"],
    ["(+44) 7700 900123", "+447700900123"],
    ["912345678", "+34912345678"],
  ])("normalises %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "12345", "500123456", "+0123456789", "abc"])("rejects %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it("masks like the database", () => {
    expect(maskPhone("+34600123456")).toBe("+34 ••• ••• 456");
  });
});

describe("signing codes", () => {
  it("are 6 random digits bound to the link", () => {
    const codes = new Set(Array.from({ length: 50 }, generateOtp));
    for (const c of codes) expect(c).toMatch(/^\d{6}$/);
    expect(codes.size).toBeGreaterThan(40);
    expect(hashOtp("a".repeat(64), "123456")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOtp("a".repeat(64), "123456")).not.toBe(hashOtp("b".repeat(64), "123456"));
  });

  it("SMS text is plain ASCII and fits one message", () => {
    for (const locale of ["es", "en"] as const) {
      const text = toSmsText(otpSmsText(locale, "123456"));
      expect(text).toMatch(/^[\x20-\x7E]+$/);
      expect(text).toContain("123456");
      expect(text.length).toBeLessThanOrEqual(160);
    }
    expect(toSmsText("código ñandú €")).toBe("codigo nandu ");
  });
});

describe("SMS providers", () => {
  it("Mensatek: POST with credentials in the body, never in the URL", async () => {
    vi.stubEnv("MENSATEK_SMS_USER", "user@example.com");
    vi.stubEnv("MENSATEK_SMS_PASSWORD", "s3cret");
    vi.stubEnv("SMS_SENDER", "Docu Firma!");
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.mensatek.com/v5/enviar.php");
      expect(String(url)).not.toContain("s3cret");
      expect(init?.method).toBe("POST");
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("Correo")).toBe("user@example.com");
      expect(body.get("Passwd")).toBe("s3cret");
      expect(body.get("Destinatarios")).toBe("34600123456");
      expect(body.get("Remitente")).toBe("DocuFirma");
      expect(body.get("Mensaje")).toBe("hola codigo 123456");
      expect(body.get("Resp")).toBe("JSON");
      return new Response(JSON.stringify({ Res: 1, Msgid: "abc123" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(isSmsAvailable()).toBe(true);
    await expect(sendSms("+34600123456", "hola código 123456")).resolves.toEqual({
      ok: true,
      id: "abc123",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Mensatek: an error answer is reported, not thrown", async () => {
    vi.stubEnv("MENSATEK_SMS_USER", "u");
    vi.stubEnv("MENSATEK_SMS_PASSWORD", "p");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ Res: -1, Msgid: "Sin creditos" }))),
    );
    const res = await sendSms("+34600123456", "x");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Sin creditos");
  });

  it("outbox: writes the message for tests", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sms-"));
    vi.stubEnv("MENSATEK_SMS_USER", "");
    vi.stubEnv("SMS_PROVIDER", "outbox");
    vi.stubEnv("SMS_OUTBOX_DIR", dir);
    await expect(sendSms("+34600123456", "codigo 654321")).resolves.toMatchObject({ ok: true });
    const [file] = readdirSync(dir);
    expect(JSON.parse(readFileSync(join(dir, file!), "utf8"))).toMatchObject({
      to: "+34600123456",
      text: "codigo 654321",
    });
  });

  it("production without credentials: unavailable", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MENSATEK_SMS_USER", "");
    vi.stubEnv("SMS_PROVIDER", "");
    vi.stubEnv("SMS_OUTBOX_DIR", "");
    expect(isSmsAvailable()).toBe(false);
  });
});
