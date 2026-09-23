import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database";
import { authCookieOptions } from "./cookies";

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Refreshes the Supabase session cookies on `response` and returns the verified user id (or null).
 * Must run on every request that renders user-specific content.
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  if (!isSupabaseConfigured()) return { userId: null as string | null };

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
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // getClaims() validates the JWT (locally with asymmetric keys, or against Auth) and refreshes it.
  const { data } = await supabase.auth.getClaims();
  return { userId: (data?.claims?.sub as string | undefined) ?? null };
}
