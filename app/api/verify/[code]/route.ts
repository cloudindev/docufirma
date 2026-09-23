import { NextResponse } from "next/server";
import { clientIpFrom } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { parseVerificationQuery, verify } from "@/lib/verification";

export const dynamic = "force-dynamic";

/** Public verification by code (DF-XXXX-XXXX) or SHA-256 of a signed PDF. */
export async function GET(request: Request, ctx: RouteContext<"/api/verify/[code]">) {
  const { code } = await ctx.params;
  const ip = clientIpFrom(request.headers) ?? "unknown";
  const limit = await rateLimit(`verify:${ip}`, 20, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { valid: false, reason: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  const query = parseVerificationQuery(decodeURIComponent(code));
  if (!query) return NextResponse.json({ valid: false, reason: "invalid_input" }, { status: 400 });
  const result = await verify(query);
  return NextResponse.json(result, {
    status: result.valid ? 200 : 404,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
