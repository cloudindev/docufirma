import "server-only";
import { hasActivePlan } from "@/lib/credits";
import { rateLimit } from "@/lib/rate-limit";
import { type AdminSupabase, createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "./http";
import { hashApiKey, isApiKeyFormat } from "./keys";

export const API_RATE_LIMIT = { limit: 120, windowSeconds: 60 };

export type ApiContext = {
  admin: AdminSupabase;
  userId: string;
  keyId: string;
  rateHeaders: Record<string, string>;
};

/**
 * Authenticates `Authorization: Bearer df_live_…`: the key must exist and not be revoked, the
 * account must have an active Pro plan, and the key is limited to 120 requests per minute.
 */
export async function authenticate(request: Request): Promise<ApiContext> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match)
    throw new ApiError(
      401,
      "missing_api_key",
      "Send your API key as `Authorization: Bearer <key>`.",
    );
  const key = match[1]!;
  if (!isApiKeyFormat(key)) throw new ApiError(401, "invalid_api_key", "The API key is not valid.");

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("api_keys")
    .select("id, user_id, revoked_at, last_used_at")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle();
  if (!row || row.revoked_at)
    throw new ApiError(401, "invalid_api_key", "The API key is not valid or has been revoked.");

  const rl = await rateLimit(`api:${row.id}`, API_RATE_LIMIT.limit, API_RATE_LIMIT.windowSeconds);
  const rateHeaders = {
    "X-RateLimit-Limit": String(API_RATE_LIMIT.limit),
    "X-RateLimit-Remaining": String(Math.max(0, rl.remaining)),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetAt.getTime() / 1000)),
  };
  if (!rl.allowed)
    throw new ApiError(
      429,
      "rate_limited",
      "Too many requests. Slow down and retry later.",
      undefined,
      {
        ...rateHeaders,
        "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000))),
      },
    );

  if (!(await hasActivePlan(admin, row.user_id)))
    throw new ApiError(
      403,
      "subscription_required",
      "The API is available with an active Pro plan.",
      undefined,
      rateHeaders,
    );

  // Throttled bookkeeping: at most one write per key and minute.
  if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > 60_000)
    await admin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);

  return { admin, userId: row.user_id, keyId: row.id, rateHeaders };
}
