import { type NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

/** OAuth (Google) and PKCE code exchange. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), "/es/app");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  const locale = next.startsWith("/en") ? "en" : "es";
  const login = locale === "en" ? "/en/login" : "/es/iniciar-sesion";
  return NextResponse.redirect(new URL(`${login}?error=linkExpired`, origin));
}
