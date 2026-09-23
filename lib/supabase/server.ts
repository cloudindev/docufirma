import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { authCookieOptions } from "./cookies";

/**
 * Server client bound to the request cookies (anon key + user session, subject to RLS).
 * Create one per request; never share across requests.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component: cookies are read-only there. The proxy refreshes
            // the session on every request, so this can be ignored safely.
          }
        },
      },
    },
  );
}

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;
