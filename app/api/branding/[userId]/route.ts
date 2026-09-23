import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Public sender logo (shown in emails and on the signing page). Logos are not secret. */
export async function GET(_request: Request, ctx: RouteContext<"/api/branding/[userId]">) {
  const { userId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(userId)) return new NextResponse(null, { status: 404 });
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("logo_path, updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.logo_path) return new NextResponse(null, { status: 404 });
  const { data } = await admin.storage.from("branding").download(profile.logo_path);
  if (!data) return new NextResponse(null, { status: 404 });
  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
