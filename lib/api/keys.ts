import { createHash, randomBytes } from "node:crypto";

/** API keys look like `df_live_<32 chars>`; only their SHA-256 is stored. */
export const API_KEY_PREFIX = "df_live_";
const API_KEY_RE = /^df_live_[A-Za-z0-9_-]{32}$/;

export function generateApiKey() {
  const key = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function isApiKeyFormat(value: string) {
  return API_KEY_RE.test(value);
}

/** Webhook signing secret shown to the user (`dfwh_<40 chars>`). */
export function generateWebhookSecret() {
  return `dfwh_${randomBytes(30).toString("base64url")}`;
}
