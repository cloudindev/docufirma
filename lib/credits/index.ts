import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** Available signatures (welcome + packs, never expire) and those reserved by pending envelopes. */
export type Credits = {
  total: number;
  reserved: number;
};

export const EMPTY_CREDITS: Credits = { total: 0, reserved: 0 };

/** Balance computed by the database from the ledger (never in TypeScript). */
export async function getCredits(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Credits> {
  const { data, error } = await supabase.rpc("get_available_credits", { p_user_id: userId });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return EMPTY_CREDITS;
  return { total: row.total, reserved: row.reserved };
}

/** SMS left for signing codes (purchased packs minus codes sent). */
export async function getSmsBalance(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("get_sms_balance", { p_user_id: userId });
  if (error) throw error;
  return data ?? 0;
}

/** The Pro plan is required to send envelopes (active, trialing or past_due while Stripe retries). */
export async function hasActivePlan(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due"])
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}
