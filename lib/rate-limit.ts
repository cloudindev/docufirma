import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: Date };

const upstashLimiters = new Map<string, Ratelimit>();

function upstash(limit: number, windowSeconds: number) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const key = `${limit}:${windowSeconds}`;
  let limiter = upstashLimiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.fixedWindow(limit, `${windowSeconds} s`),
      prefix: "docufirma:rl",
      analytics: false,
    });
    upstashLimiters.set(key, limiter);
  }
  return limiter;
}

/**
 * Fixed-window rate limiter. Uses Upstash Redis when configured, otherwise the
 * `rate_limit_hit` Postgres function. Fails open (allows) if the backend is unreachable,
 * logging the error: availability of signing links matters more than strict limiting.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  // Test environments only (e2e suites hammer the same endpoints from one IP).
  if (process.env.RATE_LIMIT_DISABLED === "true") {
    return {
      allowed: true,
      remaining: limit,
      resetAt: new Date(Date.now() + windowSeconds * 1000),
    };
  }
  try {
    const redisLimiter = upstash(limit, windowSeconds);
    if (redisLimiter) {
      const r = await redisLimiter.limit(key);
      return { allowed: r.success, remaining: r.remaining, resetAt: new Date(r.reset) };
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        allowed: true,
        remaining: limit,
        resetAt: new Date(Date.now() + windowSeconds * 1000),
      };
    }
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    const row = data?.[0];
    return {
      allowed: row?.allowed ?? true,
      remaining: row?.remaining ?? limit,
      resetAt: new Date(row?.reset_at ?? Date.now() + windowSeconds * 1000),
    };
  } catch (error) {
    console.error("[rate-limit] backend error, failing open", error);
    return {
      allowed: true,
      remaining: limit,
      resetAt: new Date(Date.now() + windowSeconds * 1000),
    };
  }
}
