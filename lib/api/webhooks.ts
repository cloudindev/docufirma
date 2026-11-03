import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { hasActivePlan } from "@/lib/credits";
import { type AdminSupabase, createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_COLUMNS, SIGNER_COLUMNS, serializeEnvelope } from "./serialize";
import { WEBHOOK_EVENTS, type WebhookEventType } from "./webhooks-events";

export { WEBHOOK_EVENTS };
export type WebhookEvent = WebhookEventType | "ping";

export const SIGNATURE_HEADER = "DocuFirma-Signature";

/** `t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<body>">` (same scheme as Stripe). */
export function signWebhook(
  secret: string,
  body: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

const allowPrivate = () => process.env.WEBHOOK_ALLOW_PRIVATE === "1";

function isPrivateAddress(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/**
 * Webhook targets must be public HTTPS endpoints (no internal addresses: SSRF). Throws with a
 * user-facing code. `WEBHOOK_ALLOW_PRIVATE=1` relaxes this for local development and tests.
 */
export async function assertWebhookUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("invalid_url");
  }
  if (allowPrivate()) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("invalid_url");
    return url;
  }
  if (url.protocol !== "https:") throw new Error("https_required");
  if (url.username || url.password) throw new Error("invalid_url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal"))
    throw new Error("private_address");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new Error("unresolvable_host");
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new Error("private_address");
  return url;
}

type Endpoint = { user_id: string; url: string; secret: string };

/** POSTs a signed event, retrying twice on network errors or 5xx/429. Records the outcome. */
export async function deliverWebhook(admin: AdminSupabase, endpoint: Endpoint, event: object) {
  const body = JSON.stringify(event);
  let status: number | null = null;
  let lastError: string | null = null;
  for (const delay of [0, 2000, 6000]) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      await assertWebhookUrl(endpoint.url); // DNS may have changed since it was saved
      const res = await fetch(endpoint.url, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "DocuFirma-Webhooks/1.0",
          [SIGNATURE_HEADER]: signWebhook(endpoint.secret, body),
        },
        body,
      });
      status = res.status;
      lastError = res.ok ? null : `HTTP ${res.status}`;
      if (res.ok || (res.status < 500 && res.status !== 429)) break;
    } catch (e) {
      lastError = (e as Error).message.slice(0, 300);
      if (["https_required", "private_address", "invalid_url"].includes(lastError)) break;
    }
  }
  await admin
    .from("webhook_endpoints")
    .update({
      last_delivery_at: new Date().toISOString(),
      last_status: status,
      last_error: lastError,
    })
    .eq("user_id", endpoint.user_id);
  return { ok: lastError === null, status, error: lastError };
}

const newEventId = () => `evt_${randomUUID().replace(/-/g, "")}`;

/**
 * Notifies the envelope owner's webhook (Pro accounts with an enabled endpoint). Never throws:
 * call it in `after()` from wherever the envelope changes state.
 */
export async function dispatchEnvelopeEvent(
  envelopeId: string,
  type: Exclude<WebhookEvent, "ping">,
  extra?: { signer_id?: string },
) {
  try {
    const admin = createAdminClient();
    const { data: envelope } = await admin
      .from("envelopes")
      .select("*")
      .eq("id", envelopeId)
      .maybeSingle();
    if (!envelope?.user_id) return;
    const { data: endpoint } = await admin
      .from("webhook_endpoints")
      .select("user_id, url, secret, enabled")
      .eq("user_id", envelope.user_id)
      .maybeSingle();
    if (!endpoint?.enabled) return;
    if (!(await hasActivePlan(admin, envelope.user_id))) return;
    const [{ data: signers }, { data: documents }] = await Promise.all([
      admin
        .from("signers")
        .select(SIGNER_COLUMNS)
        .eq("envelope_id", envelopeId)
        .order("order_index"),
      admin
        .from("documents")
        .select(DOCUMENT_COLUMNS)
        .eq("envelope_id", envelopeId)
        .order("order_index"),
    ]);
    await deliverWebhook(admin, endpoint, {
      id: newEventId(),
      object: "event",
      type,
      created_at: new Date().toISOString(),
      data: {
        envelope: serializeEnvelope(envelope, signers ?? [], documents ?? []),
        ...(extra?.signer_id ? { signer_id: extra.signer_id } : {}),
      },
    });
  } catch (error) {
    console.error(`[webhooks] ${type} ${envelopeId}:`, (error as Error).message);
  }
}

/** Sends a `ping` event so the user can check their endpoint from Settings. */
export async function sendTestWebhook(userId: string) {
  const admin = createAdminClient();
  const { data: endpoint } = await admin
    .from("webhook_endpoints")
    .select("user_id, url, secret")
    .eq("user_id", userId)
    .maybeSingle();
  if (!endpoint) return { ok: false, status: null, error: "not_configured" };
  return deliverWebhook(admin, endpoint, {
    id: newEventId(),
    object: "event",
    type: "ping",
    created_at: new Date().toISOString(),
    data: {},
  });
}
