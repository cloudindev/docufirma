import "server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Transactional SMS (signing codes).
 *  - mensatek: Mensatek HTTP API v5 (`enviar.php`), credentials MENSATEK_SMS_USER (account
 *    email) + MENSATEK_SMS_PASSWORD. Credentials travel in the POST body, never in the URL.
 *  - outbox: development / e2e. Messages are written as JSON to SMS_OUTBOX_DIR
 *    (default .local-stack/sms), like the email outbox.
 * In production without credentials SMS is unavailable and the option is hidden in the app.
 */
export type SmsProvider = "mensatek" | "outbox";
/** `raw` is the provider's answer (diagnostics only; never contains our credentials). */
export type SmsResult =
  { ok: true; id: string; raw?: string } | { ok: false; error: string; raw?: string };

export function smsProvider(): SmsProvider | null {
  const explicit = process.env.SMS_PROVIDER?.trim().toLowerCase();
  if (explicit === "outbox") return "outbox";
  if (process.env.MENSATEK_SMS_USER && process.env.MENSATEK_SMS_PASSWORD) return "mensatek";
  if (explicit === "mensatek") return null;
  if (process.env.NODE_ENV !== "production" || process.env.SMS_OUTBOX_DIR) return "outbox";
  return null;
}

export function isSmsAvailable() {
  return smsProvider() !== null;
}

/** SMS gateways are safest with plain ASCII (GSM-7): strip accents, drop anything else. */
export function toSmsText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "")
    .slice(0, 160);
}

function senderName() {
  // Alphanumeric sender IDs: up to 11 characters, letters and digits only.
  return (
    (process.env.SMS_SENDER || "DocuFirma").replace(/[^A-Za-z0-9]/g, "").slice(0, 11) || "DocuFirma"
  );
}

async function sendMensatek(to: string, text: string): Promise<SmsResult> {
  const endpoint = process.env.MENSATEK_SMS_ENDPOINT || "https://api.mensatek.com/v5/enviar.php";
  const body = new URLSearchParams({
    Correo: process.env.MENSATEK_SMS_USER ?? "",
    Passwd: process.env.MENSATEK_SMS_PASSWORD ?? "",
    Destinatarios: to.replace(/^\+/, ""),
    Remitente: senderName(),
    Mensaje: text,
    Report: "0",
    Resp: "JSON",
  });
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const raw = await res.text();
    let parsed: { Res?: unknown; Msgid?: unknown } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Non-JSON answers are errors (e.g. HTML error pages).
    }
    const sent = Number(parsed.Res);
    if (res.ok && Number.isFinite(sent) && sent > 0) {
      return {
        ok: true,
        id: String(parsed.Msgid ?? `mensatek-${Date.now()}`),
        raw: raw.slice(0, 500),
      };
    }
    return {
      ok: false,
      error: `mensatek: HTTP ${res.status} ${raw.slice(0, 200)}`,
      raw: raw.slice(0, 500),
    };
  } catch (error) {
    return { ok: false, error: `mensatek: ${(error as Error).message}` };
  }
}

function sendOutbox(to: string, text: string): SmsResult {
  const dir = process.env.SMS_OUTBOX_DIR || join(process.cwd(), ".local-stack", "sms");
  mkdirSync(dir, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  writeFileSync(
    join(dir, `${id}__${to.replace(/[^0-9+]/g, "")}.json`),
    JSON.stringify({ id, to, text, createdAt: new Date().toISOString() }, null, 2),
  );
  console.info(`[sms:outbox] → ${to}: ${text}`);
  return { ok: true, id: `outbox_${id}` };
}

/** Sends an SMS. Never throws. `to` must be E.164. */
export async function sendSms(to: string, text: string): Promise<SmsResult> {
  const provider = smsProvider();
  if (!provider) return { ok: false, error: "not_configured" };
  const message = toSmsText(text);
  return provider === "mensatek" ? sendMensatek(to, message) : sendOutbox(to, message);
}
