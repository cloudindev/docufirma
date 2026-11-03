import "server-only";
import { getSmsBalance, hasActivePlan } from "@/lib/credits";
import type { EnvelopeSettings, EnvelopeSettingsInput } from "@/lib/envelopes/schemas";
import { issueTokenAndEmail, signUrl } from "@/lib/signing/notify";
import { generateSignerToken, hashToken } from "@/lib/signing/tokens";
import { isSmsAvailable } from "@/lib/sms";
import { BUCKETS } from "@/lib/storage/paths";
import type { AdminSupabase } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/validation/phone";

/**
 * Envelope operations shared by the web app (server actions) and the public API.
 * Callers check ownership first; these functions trust `userId` / `envelopeId`.
 */

/** Writes the settings and the signer list of a draft (signers are replaced wholesale). */
export async function writeDraftSettings(
  admin: AdminSupabase,
  envelopeId: string,
  d: EnvelopeSettings,
): Promise<boolean> {
  const { error } = await admin
    .from("envelopes")
    .update({
      title: d.title,
      message: d.message || null,
      sequential: d.sequential && d.signers.length > 1,
      locale: d.locale,
      expiry_days: d.expiryDays,
      reminder_days: d.reminderDays,
    })
    .eq("id", envelopeId)
    .eq("status", "draft");
  if (error) return false;

  // Duplicates by email are collapsed.
  const unique = [...new Map(d.signers.map((s) => [s.email.toLowerCase(), s])).values()];
  await admin.from("signers").delete().eq("envelope_id", envelopeId);
  if (unique.length) {
    const { error: sErr } = await admin.from("signers").insert(
      unique.map((s, i) => {
        const phone = normalizePhone(s.phone);
        return {
          envelope_id: envelopeId,
          first_name: s.firstName,
          last_name: s.lastName,
          email: s.email,
          order_index: i,
          phone,
          require_sms_otp: Boolean(s.requireSmsOtp && phone),
          delivery: s.delivery,
        };
      }),
    );
    if (sErr) return false;
  }
  return true;
}

/** Current settings of an envelope as stored (input shape of the settings schema). */
export async function loadEnvelopeSettings(
  admin: AdminSupabase,
  envelopeId: string,
): Promise<EnvelopeSettingsInput | null> {
  const [{ data: envelope }, { data: signers }] = await Promise.all([
    admin
      .from("envelopes")
      .select("title, message, sequential, locale, expiry_days, reminder_days")
      .eq("id", envelopeId)
      .maybeSingle(),
    admin
      .from("signers")
      .select("first_name, last_name, email, phone, require_sms_otp, delivery")
      .eq("envelope_id", envelopeId)
      .order("order_index"),
  ]);
  if (!envelope) return null;
  return {
    title: envelope.title,
    message: envelope.message ?? "",
    sequential: envelope.sequential,
    locale: envelope.locale === "en" ? "en" : "es",
    expiryDays: envelope.expiry_days,
    reminderDays: envelope.reminder_days,
    signers: (signers ?? []).map((s) => ({
      firstName: s.first_name,
      lastName: s.last_name,
      email: s.email,
      phone: s.phone ?? "",
      requireSmsOtp: s.require_sms_otp,
      delivery: s.delivery === "in_person" ? ("in_person" as const) : ("email" as const),
    })),
  };
}

export type SendPreconditionError = "subscription_required" | "sms_unavailable" | "sms_no_credits";

/** Plan and SMS checks done before reserving credits (credits are checked atomically in SQL). */
export async function checkSendPreconditions(
  admin: AdminSupabase,
  userId: string,
  settings: EnvelopeSettings,
): Promise<SendPreconditionError | null> {
  if (!(await hasActivePlan(admin, userId))) return "subscription_required";
  const smsSigners = settings.signers.filter((s) => s.requireSmsOtp).length;
  if (smsSigners > 0) {
    if (!isSmsAvailable()) return "sms_unavailable";
    // Each SMS signer needs at least one code.
    const smsBalance = await getSmsBalance(admin, userId).catch(() => 0);
    if (smsBalance < smsSigners) return "sms_no_credits";
  }
  return null;
}

/** Deletes a draft and its uploaded originals. */
export async function deleteDraftEnvelope(
  admin: AdminSupabase,
  userId: string,
  envelopeId: string,
): Promise<boolean> {
  const { data: docs } = await admin
    .from("documents")
    .select("original_path")
    .eq("envelope_id", envelopeId);
  const { error } = await admin.rpc("delete_draft_envelope", {
    p_envelope_id: envelopeId,
    p_user_id: userId,
  });
  if (error) return false;
  const files = (docs ?? []).map((d) => d.original_path);
  if (files.length) await admin.storage.from(BUCKETS.originals).remove(files);
  return true;
}

/**
 * Manual reminder to every pending email signer whose turn it is; at most one per signer per
 * hour (the cron sends the automatic ones). Returns how many were emailed.
 */
export async function remindPendingSigners(admin: AdminSupabase, envelopeId: string) {
  const { data: signers } = await admin
    .from("signers")
    .select("id, last_reminder_at, sent_at")
    .eq("envelope_id", envelopeId)
    .eq("delivery", "email")
    .in("status", ["sent", "viewed"]);
  const hourAgo = Date.now() - 60 * 60 * 1000;
  let sent = 0;
  for (const s of signers ?? []) {
    const last = Math.max(
      Date.parse(s.last_reminder_at ?? "") || 0,
      Date.parse(s.sent_at ?? "") || 0,
    );
    if (last > hourAgo) continue;
    try {
      const res = await issueTokenAndEmail(admin, s.id, { reminder: true });
      if (res.ok) sent += 1;
    } catch (error) {
      console.error("[remind]", error);
    }
  }
  return sent;
}

/**
 * In-person signing: revokes the signer's previous links, issues a fresh one and records who
 * hosts the session. Returns the signing URL to open on the host's device.
 */
export async function startInPersonSession(
  admin: AdminSupabase,
  args: {
    userId: string;
    signerId: string;
    locale: "es" | "en";
    host: string;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<
  { ok: true; url: string } | { ok: false; error: "not_found" | "not_your_turn" | "not_active" }
> {
  const token = generateSignerToken();
  const { error } = await admin.rpc("start_in_person_signing", {
    p_signer_id: args.signerId,
    p_user_id: args.userId,
    p_token_hash: hashToken(token),
    p_host: args.host,
    p_ip: args.ip ?? undefined,
    p_user_agent: args.userAgent?.slice(0, 512) ?? undefined,
  });
  if (error) {
    if (error.message.includes("not_your_turn")) return { ok: false, error: "not_your_turn" };
    if (error.message.includes("signer_not_found") || error.message.includes("not_in_person"))
      return { ok: false, error: "not_found" };
    console.error("[in-person]", error.message);
    return { ok: false, error: "not_active" };
  }
  return { ok: true, url: signUrl(args.locale, token) };
}
