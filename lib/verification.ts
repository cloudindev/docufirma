import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const VERIFICATION_CODE_RE = /^DF-[0-9A-Z]{4}-[0-9A-Z]{4}$/;
export const SHA256_RE = /^[0-9a-f]{64}$/;

export type VerificationArtifact = {
  id: string;
  kind: "document" | "evidence";
  name: string;
  originalSha256: string | null;
  signedSha256: string;
  matched: boolean;
  tsa: {
    status: "pending" | "granted" | "failed";
    provider: string | null;
    genTime: string | null;
    serial: string | null;
    policyOid: string | null;
    authority: string | null;
    tsrAvailable: boolean;
  };
};

export type VerificationResult =
  | { valid: false; reason: "not_found" | "invalid_input" }
  | {
      valid: true;
      code: string;
      title: string;
      completedAt: string | null;
      signers: { name: string; signedAt: string | null }[];
      artifacts: VerificationArtifact[];
    };

/** Normalises user input: verification code (DF-XXXX-XXXX) or SHA-256 hex. */
export function parseVerificationQuery(raw: string): { code: string } | { hash: string } | null {
  const value = raw.trim();
  const code = value.toUpperCase().replace(/\s+/g, "");
  if (VERIFICATION_CODE_RE.test(code)) return { code };
  // Accept codes typed without dashes: DFABCD1234 / DF-ABCD1234
  if (/^DF-?[0-9A-Z]{8}$/.test(code)) {
    const body = code.replace(/^DF-?/, "");
    return { code: `DF-${body.slice(0, 4)}-${body.slice(4)}` };
  }
  const hash = value.toLowerCase();
  if (SHA256_RE.test(hash)) return { hash };
  return null;
}

/**
 * Public verification. Never exposes documents, emails or network data: only title,
 * signer names, dates, fingerprints and timestamp metadata of completed envelopes.
 */
export async function verify(
  query: { code: string } | { hash: string },
): Promise<VerificationResult> {
  const admin = createAdminClient();
  let envelopeId: string | null = null;
  let matchedId: string | null = null;

  if ("code" in query) {
    const { data } = await admin
      .from("envelopes")
      .select("id")
      .eq("verification_code", query.code)
      .eq("status", "completed")
      .maybeSingle();
    envelopeId = data?.id ?? null;
  } else {
    const { data } = await admin
      .from("signed_documents")
      .select("id, envelope_id")
      .eq("signed_sha256", query.hash)
      .limit(1)
      .maybeSingle();
    envelopeId = data?.envelope_id ?? null;
    matchedId = data?.id ?? null;
  }
  if (!envelopeId) return { valid: false, reason: "not_found" };

  const [{ data: envelope }, { data: signers }, { data: artifacts }] = await Promise.all([
    admin
      .from("envelopes")
      .select("id, title, verification_code, completed_at, status")
      .eq("id", envelopeId)
      .single(),
    admin
      .from("signers")
      .select("first_name, last_name, signed_at, order_index")
      .eq("envelope_id", envelopeId)
      .order("order_index"),
    admin
      .from("signed_documents")
      .select(
        "id, kind, signed_sha256, tsa_status, tsa_provider, tsa_gen_time, tsa_serial, tsa_policy_oid, tsa_name, tsr_path, documents(name, original_sha256, order_index)",
      )
      .eq("envelope_id", envelopeId),
  ]);
  if (!envelope || envelope.status !== "completed" || !envelope.verification_code) {
    return { valid: false, reason: "not_found" };
  }

  const sorted = (artifacts ?? []).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "document" ? -1 : 1;
    return (a.documents?.order_index ?? 0) - (b.documents?.order_index ?? 0);
  });

  return {
    valid: true,
    code: envelope.verification_code,
    title: envelope.title,
    completedAt: envelope.completed_at,
    signers: (signers ?? []).map((s) => ({
      name: `${s.first_name} ${s.last_name}`.trim(),
      signedAt: s.signed_at,
    })),
    artifacts: sorted.map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.documents?.name ?? "evidence.pdf",
      originalSha256: a.documents?.original_sha256 ?? null,
      signedSha256: a.signed_sha256,
      matched: a.id === matchedId,
      tsa: {
        status: a.tsa_status,
        provider: a.tsa_provider,
        genTime: a.tsa_gen_time,
        serial: a.tsa_serial,
        policyOid: a.tsa_policy_oid,
        authority: a.tsa_name,
        tsrAvailable: Boolean(a.tsr_path) && a.tsa_status === "granted",
      },
    })),
  };
}
