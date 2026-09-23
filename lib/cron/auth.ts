import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Scheduled callers (Supabase pg_cron via pg_net, D-036) send `Authorization: Bearer <CRON_SECRET>`. */
export function isAuthorizedCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
