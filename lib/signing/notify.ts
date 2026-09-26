import "server-only";
import { brandingLogoUrl, sendSignerInvitation } from "@/lib/email";
import { appUrl } from "@/lib/env-public";
import { logEvent } from "@/lib/events";
import { getPathname } from "@/lib/i18n/navigation";
import type { AdminSupabase } from "@/lib/supabase/admin";
import { fullName } from "@/lib/utils";
import { generateSignerToken, hashToken } from "./tokens";

export function signUrl(locale: "es" | "en", token: string) {
  return appUrl(getPathname({ href: { pathname: "/sign/[token]", params: { token } }, locale }));
}

async function loadContext(admin: AdminSupabase, signerId: string) {
  const { data: signer } = await admin
    .from("signers")
    .select("id, first_name, last_name, email, envelope_id, delivery")
    .eq("id", signerId)
    .single();
  if (!signer) throw new Error(`signer ${signerId} not found`);
  const [{ data: envelope }, { data: documents }] = await Promise.all([
    admin
      .from("envelopes")
      .select(
        "id, user_id, title, message, locale, expires_at, sender_name, sender_email, sender_company",
      )
      .eq("id", signer.envelope_id)
      .single(),
    admin
      .from("documents")
      .select("name")
      .eq("envelope_id", signer.envelope_id)
      .order("order_index"),
  ]);
  if (!envelope) throw new Error("envelope not found");
  const { data: profile } = envelope.user_id
    ? await admin.from("profiles").select("logo_path").eq("id", envelope.user_id).maybeSingle()
    : { data: null };
  return { signer, envelope, documents: documents ?? [], logoPath: profile?.logo_path ?? null };
}

/** Emails the signing link (token in plaintext only here) and records the event. */
export async function emailSigner(
  admin: AdminSupabase,
  signerId: string,
  token: string,
  opts: { reminder?: boolean } = {},
) {
  const { signer, envelope, documents, logoPath } = await loadContext(admin, signerId);
  // In-person signers sign on the sender's device: their link is never emailed.
  if (signer.delivery === "in_person")
    return { ok: false, skipped: true, name: fullName(signer.first_name, signer.last_name) };
  const locale = envelope.locale === "en" ? "en" : "es";
  const senderDisplay = envelope.sender_company
    ? `${envelope.sender_name} (${envelope.sender_company})`
    : (envelope.sender_name ?? "DocuFirma");

  const result = await sendSignerInvitation(
    signer.email,
    {
      locale,
      logoUrl: brandingLogoUrl(envelope.user_id, logoPath),
      signerName: signer.first_name,
      senderName: senderDisplay,
      title: envelope.title,
      message: envelope.message,
      documents: documents.map((d) => d.name),
      expiresAt: envelope.expires_at ?? new Date().toISOString(),
      signUrl: signUrl(locale, token),
      reminder: opts.reminder,
    },
    {
      replyTo: envelope.sender_email ?? undefined,
      idempotencyKey: `signer-link:${hashToken(token)}`,
    },
  );

  if (opts.reminder) {
    await admin.rpc("record_reminder", {
      p_signer_id: signerId,
      p_resend_id: result.id ?? undefined,
    });
  }
  await logEvent(admin, {
    envelopeId: envelope.id,
    signerId,
    type: result.id ? "email_sent" : "email_failed",
    metadata: {
      kind: opts.reminder ? "reminder" : "invitation",
      resend_id: result.id,
      error: result.error ?? null,
    },
  });
  return {
    ok: Boolean(result.id),
    skipped: false,
    name: fullName(signer.first_name, signer.last_name),
  };
}

/** Issues a fresh token for a signer (next sequential signer, or reminder) and emails it. */
export async function issueTokenAndEmail(
  admin: AdminSupabase,
  signerId: string,
  opts: { reminder?: boolean } = {},
) {
  const token = generateSignerToken();
  const { error } = await admin.rpc("issue_signer_token", {
    p_signer_id: signerId,
    p_token_hash: hashToken(token),
  });
  if (error) throw new Error(`issue_signer_token: ${error.message}`);
  return emailSigner(admin, signerId, token, opts);
}
