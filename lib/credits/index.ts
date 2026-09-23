import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type Credits = {
  monthly: number;
  pack: number;
  total: number;
  monthlyGranted: number;
  monthlyExpiresAt: string | null;
  reserved: number;
};

export const EMPTY_CREDITS: Credits = {
  monthly: 0,
  pack: 0,
  total: 0,
  monthlyGranted: 0,
  monthlyExpiresAt: null,
  reserved: 0,
};

/** Balance computed by the database from the ledger (never in TypeScript). */
export async function getCredits(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Credits> {
  const { data, error } = await supabase.rpc("get_available_credits", { p_user_id: userId });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return EMPTY_CREDITS;
  return {
    monthly: row.monthly_available,
    pack: row.pack_available,
    total: row.total,
    monthlyGranted: row.monthly_granted,
    monthlyExpiresAt: row.monthly_expires_at,
    reserved: row.reserved,
  };
}
