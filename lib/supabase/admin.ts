import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let admin: SupabaseClient<Database> | undefined;

/**
 * Service-role client. Bypasses RLS: use ONLY in server code after authorising the caller
 * (ownership checks, token validation, webhooks, crons).
 */
export function createAdminClient(): SupabaseClient<Database> {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  admin = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-application-name": "docufirma-server" } },
  });
  return admin;
}

export type AdminSupabase = SupabaseClient<Database>;
