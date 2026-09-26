import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = () => process.env.SMS_OUTBOX_DIR ?? join(process.cwd(), ".local-stack", "sms");

/** Waits for a new SMS to `phone` (E.164) in the local outbox and returns its 6-digit code. */
export async function waitForSmsCode(phone: string, after = 0, timeoutMs = 15_000) {
  const start = Date.now();
  const suffix = `__${phone.replace(/[^0-9+]/g, "")}.json`;
  while (Date.now() - start < timeoutMs) {
    let files: string[] = [];
    try {
      files = readdirSync(dir()).filter((f) => f.endsWith(suffix));
    } catch {
      // outbox not created yet
    }
    const fresh = files
      .map(
        (f) =>
          JSON.parse(readFileSync(join(dir(), f), "utf8")) as { text: string; createdAt: string },
      )
      .filter((m) => Date.parse(m.createdAt) >= after)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const code = fresh.at(-1)?.text.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No SMS for ${phone} in outbox`);
}

export function smsCount(phone: string) {
  const suffix = `__${phone.replace(/[^0-9+]/g, "")}.json`;
  try {
    return readdirSync(dir()).filter((f) => f.endsWith(suffix)).length;
  } catch {
    return 0;
  }
}

/** Tops up the SMS balance of a user (as if they had bought a pack) through the service role. */
export async function grantSms(email: string, amount = 10) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();
  if (error || !profile) throw new Error(`No profile for ${email}`);
  const { error: rpcError } = await admin.rpc("adjust_sms_credits", {
    p_user_id: profile.id,
    p_amount: amount,
    p_note: "e2e",
  });
  if (rpcError) throw rpcError;
  return profile.id as string;
}
