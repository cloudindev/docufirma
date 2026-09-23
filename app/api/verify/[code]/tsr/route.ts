import { NextResponse } from "next/server";
import { clientIpFrom } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseVerificationQuery } from "@/lib/verification";

export const dynamic = "force-dynamic";

/**
 * Downloads the RFC 3161 timestamp response (.tsr) of a signed artifact. A TSR only contains
 * the document hash and the TSA signature, so it is safe to publish to anyone holding the code.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/verify/[code]/tsr">) {
  const { code } = await ctx.params;
  const artifactId = new URL(request.url).searchParams.get("artifact") ?? "";
  const ip = clientIpFrom(request.headers) ?? "unknown";
  if (!(await rateLimit(`verify-tsr:${ip}`, 30, 60)).allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const query = parseVerificationQuery(decodeURIComponent(code));
  if (!query || !("code" in query) || !/^[0-9a-f-]{36}$/.test(artifactId)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("signed_documents")
    .select(
      "tsr_path, tsa_status, kind, documents(name), envelopes!inner(verification_code, status)",
    )
    .eq("id", artifactId)
    .eq("envelopes.verification_code", query.code)
    .eq("envelopes.status", "completed")
    .maybeSingle();
  if (!data?.tsr_path || data.tsa_status !== "granted")
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: file, error } = await admin.storage.from("tsa").download(data.tsr_path);
  if (error || !file) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const base = (
    data.kind === "evidence" ? "evidence" : (data.documents?.name ?? "document")
  ).replace(/\.pdf$/i, "");
  return new NextResponse(await file.arrayBuffer(), {
    headers: {
      "Content-Type": "application/timestamp-reply",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(base)}.tsr"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
