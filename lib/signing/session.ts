import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, isWellFormedToken } from "./tokens";

export type SignerState =
  "invalid" | "expired" | "canceled" | "declined" | "already_signed" | "not_your_turn" | "ready";

export type SigningContext = {
  state: SignerState;
  tokenHash: string;
  signer?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: string;
    orderIndex: number;
  };
  envelope?: {
    id: string;
    userId: string | null;
    title: string;
    message: string | null;
    status: string;
    locale: "es" | "en";
    sequential: boolean;
    expiresAt: string | null;
    allSignedAt: string | null;
    senderName: string | null;
    senderCompany: string | null;
    senderEmail: string | null;
  };
  documents?: { id: string; name: string; pageCount: number; path: string; sha256: string }[];
  hasLogo?: boolean;
};

/**
 * Resolves a signing link (read-only). The authoritative checks happen again inside the
 * transactional SQL functions; this is for rendering the right screen.
 */
export async function resolveSigningToken(token: string): Promise<SigningContext> {
  if (!isWellFormedToken(token)) return { state: "invalid", tokenHash: "" };
  const tokenHash = hashToken(token);
  const admin = createAdminClient();
  const { data: access } = await admin
    .from("signer_access_tokens")
    .select("signer_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!access) return { state: "invalid", tokenHash };

  const { data: signer } = await admin
    .from("signers")
    .select("id, first_name, last_name, email, status, order_index, envelope_id")
    .eq("id", access.signer_id)
    .single();
  if (!signer) return { state: "invalid", tokenHash };

  const [{ data: envelope }, { data: documents }, { data: earlier }] = await Promise.all([
    admin
      .from("envelopes")
      .select(
        "id, user_id, title, message, status, locale, sequential, expires_at, all_signed_at, sender_name, sender_company, sender_email",
      )
      .eq("id", signer.envelope_id)
      .single(),
    admin
      .from("documents")
      .select("id, name, page_count, original_path, original_sha256")
      .eq("envelope_id", signer.envelope_id)
      .order("order_index"),
    admin
      .from("signers")
      .select("id")
      .eq("envelope_id", signer.envelope_id)
      .lt("order_index", signer.order_index)
      .neq("status", "signed"),
  ]);
  if (!envelope) return { state: "invalid", tokenHash };

  const { data: profile } = envelope.user_id
    ? await admin.from("profiles").select("logo_path").eq("id", envelope.user_id).maybeSingle()
    : { data: null };

  const ctx: SigningContext = {
    state: "ready",
    tokenHash,
    signer: {
      id: signer.id,
      firstName: signer.first_name,
      lastName: signer.last_name,
      email: signer.email,
      status: signer.status,
      orderIndex: signer.order_index,
    },
    envelope: {
      id: envelope.id,
      userId: envelope.user_id,
      title: envelope.title,
      message: envelope.message,
      status: envelope.status,
      locale: envelope.locale === "en" ? "en" : "es",
      sequential: envelope.sequential,
      expiresAt: envelope.expires_at,
      allSignedAt: envelope.all_signed_at,
      senderName: envelope.sender_name,
      senderCompany: envelope.sender_company,
      senderEmail: envelope.sender_email,
    },
    documents: (documents ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      pageCount: d.page_count,
      path: d.original_path,
      sha256: d.original_sha256,
    })),
    hasLogo: Boolean(profile?.logo_path),
  };

  if (signer.status === "signed" || envelope.status === "completed") ctx.state = "already_signed";
  else if (envelope.status === "canceled" || access.revoked_at) ctx.state = "canceled";
  else if (envelope.status === "declined" || signer.status === "declined") ctx.state = "declined";
  else if (
    envelope.status === "expired" ||
    (envelope.expires_at && Date.parse(envelope.expires_at) <= Date.now()) ||
    Date.parse(access.expires_at) <= Date.now()
  )
    ctx.state = "expired";
  else if (envelope.status === "draft") ctx.state = "invalid";
  else if (signer.status === "pending" || (envelope.sequential && (earlier?.length ?? 0) > 0))
    ctx.state = "not_your_turn";
  return ctx;
}

/** Maps SQL exception messages from the workflow functions to signer states. */
export function stateFromSqlError(message: string): SignerState | "error" {
  if (message.includes("invalid_token")) return "invalid";
  if (message.includes("token_expired") || message.includes("envelope_expired")) return "expired";
  if (message.includes("envelope_canceled")) return "canceled";
  if (message.includes("envelope_declined") || message.includes("already_declined"))
    return "declined";
  if (message.includes("already_signed")) return "already_signed";
  if (message.includes("not_your_turn")) return "not_your_turn";
  return "error";
}
