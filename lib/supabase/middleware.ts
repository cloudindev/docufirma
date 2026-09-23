import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database";
import { authCookieOptions } from "./cookies";

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

/**
 * Validates (and, when expired, refreshes) the Supabase session for this request.
 *
 * Must run BEFORE any code that snapshots the request headers (next-intl copies them to build
 * the downstream request). Refreshed cookies are written to `request.cookies`, so the page
 * render sees the new tokens; otherwise it retries the refresh with the already-used refresh
 * token and the session is lost. Call `apply(response)` on whatever response is returned so the
 * browser stores the new cookies too.
 */
export async function updateSession(request: NextRequest) {
  const pending: CookieToSet[] = [];
  let extraHeaders: Record<string, string> = {};
  const apply = <T extends NextResponse>(response: T): T => {
    pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    Object.entries(extraHeaders).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  };
  if (!isSupabaseConfigured()) return { userId: null as string | null, apply };

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          pending.push(...cookiesToSet);
          extraHeaders = { ...extraHeaders, ...(headers ?? {}) };
        },
      },
    },
  );

  // getClaims() validates the JWT (locally with asymmetric keys, or against Auth) and refreshes it.
  const { data } = await supabase.auth.getClaims();
  return { userId: (data?.claims?.sub as string | undefined) ?? null, apply };
}
