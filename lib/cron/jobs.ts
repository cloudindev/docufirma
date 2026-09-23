import "server-only";
import { LIMITS } from "@/lib/config";
import { sendEnvelopeNotice } from "@/lib/email";
import { appUrl } from "@/lib/env-public";
import { getPathname } from "@/lib/i18n/navigation";
import { issueTokenAndEmail } from "@/lib/signing/notify";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY = 24 * 60 * 60 * 1000;

/** Automatic reminders: every `reminder_days`, max LIMITS.maxReminders per signer. */
export async function runReminders(limit = 50) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("signers")
    .select(
      "id, sent_at, last_reminder_at, reminder_count, envelopes!inner(id, status, reminder_days, expires_at)",
    )
    .in("status", ["sent", "viewed"])
    .lt("reminder_count", LIMITS.maxReminders)
    .in("envelopes.status", ["sent", "viewed"])
    .gt("envelopes.reminder_days", 0)
    .order("last_reminder_at", { ascending: true, nullsFirst: true })
    .limit(500);
  const now = Date.now();
  const due = (data ?? []).filter((s) => {
    const env = s.envelopes;
    if (!env || (env.expires_at && Date.parse(env.expires_at) <= now)) return false;
    const last = Date.parse(s.last_reminder_at ?? s.sent_at ?? "") || 0;
    return last > 0 && now - last >= env.reminder_days * DAY;
  });
  let sent = 0;
  for (const s of due.slice(0, limit)) {
    try {
      const res = await issueTokenAndEmail(admin, s.id, { reminder: true });
      if (res.ok) sent += 1;
    } catch (error) {
      console.error("[cron:reminders]", s.id, (error as Error).message);
    }
  }
  return { candidates: due.length, sent };
}

/** Expires overdue envelopes (credits released in SQL) and notifies the senders. */
export async function runExpirations(limit = 100) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("expire_due_envelopes", { p_limit: limit });
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const { data: env } = await admin
      .from("envelopes")
      .select("id, title, user_id")
      .eq("id", row.envelope_id)
      .single();
    if (!env?.user_id) continue;
    const { data: sender } = await admin
      .from("profiles")
      .select("email, locale")
      .eq("id", env.user_id)
      .maybeSingle();
    if (!sender) continue;
    const locale = sender.locale === "en" ? "en" : "es";
    await sendEnvelopeNotice(sender.email, {
      locale,
      kind: "expired",
      title: env.title,
      envelopeUrl: appUrl(
        getPathname({ href: { pathname: "/app/envelopes/[id]", params: { id: env.id } }, locale }),
      ),
    });
  }
  return { expired: data?.length ?? 0 };
}

/** Deletes encrypted biometric files older than BIOMETRIC_RETENTION_YEARS (default 5). */
export async function runRetention(limit = 200) {
  const years = Math.max(1, Number(process.env.BIOMETRIC_RETENTION_YEARS ?? 5) || 5);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_expired_biometrics", {
    p_years: years,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  const paths = (data ?? [])
    .map((r) => r.biometric_data_path)
    .filter((p): p is string => Boolean(p));
  for (let i = 0; i < paths.length; i += 100) {
    const { error: rmError } = await admin.storage.from("evidence").remove(paths.slice(i, i + 100));
    if (rmError) console.error("[cron:retention] storage remove failed", rmError.message);
  }
  return { purged: paths.length, years };
}
