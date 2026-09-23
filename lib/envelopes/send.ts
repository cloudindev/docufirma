import "server-only";
import { sendAccountNotice } from "@/lib/email";
import { appUrl } from "@/lib/env-public";
import { getCredits } from "@/lib/credits";
import { LIMITS } from "@/lib/config";
import { getPathname } from "@/lib/i18n/navigation";
import { emailSigner } from "@/lib/signing/notify";
import { generateSignerToken, generateVerificationCode, hashToken } from "@/lib/signing/tokens";
import type { AdminSupabase } from "@/lib/supabase/admin";
import { fullName } from "@/lib/utils";

export type SendResult =
  | { ok: true; notified: number }
  | { ok: false; error: "insufficient_credits"; needed: number; available: number }
  | { ok: false; error: "not_draft" | "no_documents" | "no_signers" | "generic" };

/**
 * Sends a draft envelope: generates one token per signer (only hashes reach the DB),
 * reserves credits and flips the status atomically in `send_envelope`, then emails the
 * signers whose turn it is. Emails happen after the transaction commits.
 */
export async function sendDraftEnvelope(
  admin: AdminSupabase,
  userId: string,
  envelopeId: string,
): Promise<SendResult> {
  const [{ data: envelope }, { data: signers }, { data: profile }] = await Promise.all([
    admin
      .from("envelopes")
      .select("id, user_id, status, expiry_days, locale")
      .eq("id", envelopeId)
      .single(),
    admin.from("signers").select("id").eq("envelope_id", envelopeId),
    admin
      .from("profiles")
      .select("first_name, last_name, email, company_name, locale")
      .eq("id", userId)
      .single(),
  ]);
  if (!envelope || envelope.user_id !== userId || !profile) return { ok: false, error: "generic" };
  if (envelope.status !== "draft") return { ok: false, error: "not_draft" };
  if (!signers?.length) return { ok: false, error: "no_signers" };

  const before = await getCredits(admin, userId);
  const tokens = new Map(signers.map((s) => [s.id, generateSignerToken()]));
  const expiresAt = new Date(Date.now() + envelope.expiry_days * 24 * 60 * 60 * 1000);

  let result: { notify: string[] } | null = null;
  for (let attempt = 0; attempt < 5 && !result; attempt++) {
    const { data, error } = await admin.rpc("send_envelope", {
      p_envelope_id: envelopeId,
      p_user_id: userId,
      p_tokens: [...tokens].map(([signer_id, token]) => ({
        signer_id,
        token_hash: hashToken(token),
      })),
      p_verification_code: generateVerificationCode(),
      p_expires_at: expiresAt.toISOString(),
      p_sender: {
        name: fullName(profile.first_name, profile.last_name) || profile.email,
        email: profile.email,
        company: profile.company_name ?? "",
      },
    });
    if (error) {
      if (error.message.includes("verification_code")) continue; // code collision: retry with a new one
      if (error.message.includes("insufficient_credits")) {
        return {
          ok: false,
          error: "insufficient_credits",
          needed: signers.length,
          available: before.total,
        };
      }
      if (error.message.includes("no_documents")) return { ok: false, error: "no_documents" };
      if (error.message.includes("envelope_not_draft")) return { ok: false, error: "not_draft" };
      console.error("[send_envelope]", error.message);
      return { ok: false, error: "generic" };
    }
    result = data as { notify: string[] };
  }
  if (!result) return { ok: false, error: "generic" };

  // Remember recipients in the address book (unique per lower(email)).
  const { data: signerRows } = await admin
    .from("signers")
    .select("first_name, last_name, email")
    .eq("envelope_id", envelopeId);
  if (signerRows?.length) await rememberContacts(admin, userId, signerRows);

  let notified = 0;
  for (const signerId of result.notify) {
    const token = tokens.get(signerId);
    if (!token) continue;
    const res = await emailSigner(admin, signerId, token);
    if (res.ok) notified += 1;
  }

  // Low balance warning when crossing the threshold.
  const after = await getCredits(admin, userId);
  if (before.total > LIMITS.lowCreditsThreshold && after.total <= LIMITS.lowCreditsThreshold) {
    const locale = profile.locale === "en" ? "en" : "es";
    await sendAccountNotice(profile.email, {
      locale,
      kind: "creditsLow",
      count: after.total,
      ctaUrl: appUrl(getPathname({ href: "/app/billing", locale })),
    });
  }
  return { ok: true, notified };
}

async function rememberContacts(
  admin: AdminSupabase,
  userId: string,
  rows: { first_name: string; last_name: string; email: string }[],
) {
  const now = new Date().toISOString();
  const { data: existing } = await admin.from("contacts").select("id, email").eq("user_id", userId);
  const byEmail = new Map((existing ?? []).map((c) => [c.email.toLowerCase(), c.id]));
  const missing = rows.filter((r) => !byEmail.has(r.email.toLowerCase()));
  const known = rows
    .map((r) => byEmail.get(r.email.toLowerCase()))
    .filter((id): id is string => Boolean(id));
  if (known.length) await admin.from("contacts").update({ last_used_at: now }).in("id", known);
  if (missing.length) {
    const { error } = await admin
      .from("contacts")
      .insert(
        missing.map((r) => ({
          user_id: userId,
          first_name: r.first_name,
          last_name: r.last_name,
          email: r.email,
          last_used_at: now,
        })),
      );
    if (error) console.warn("[contacts] insert", error.message);
  }
}
