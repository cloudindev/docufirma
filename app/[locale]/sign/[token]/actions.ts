"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { closeEnvelope } from "@/lib/closure";
import { LIMITS } from "@/lib/config";
import { sendEnvelopeNotice } from "@/lib/email";
import { appUrl } from "@/lib/env-public";
import { clientIpFrom, geoFrom } from "@/lib/http";
import { getPathname } from "@/lib/i18n/navigation";
import { rateLimit } from "@/lib/rate-limit";
import { canonicalJson, computeMetrics } from "@/lib/signing/biometrics";
import { encryptEvidence } from "@/lib/signing/evidence-crypto";
import { issueTokenAndEmail } from "@/lib/signing/notify";
import { completeSignatureSchema } from "@/lib/signing/schemas";
import { resolveSigningToken, type SignerState, stateFromSqlError } from "@/lib/signing/session";
import { normaliseSignaturePng } from "@/lib/signing/signature-image";
import { sha256Hex } from "@/lib/signing/tokens";
import { BUCKETS, paths, safeFileName } from "@/lib/storage/paths";
import { createAdminClient } from "@/lib/supabase/admin";

type Fail = { ok: false; error: string; state?: SignerState };

async function requestMeta() {
  const h = await headers();
  return {
    ip: clientIpFrom(h),
    userAgent: h.get("user-agent")?.slice(0, 512) ?? null,
    geo: geoFrom(h),
  };
}

async function limited(scope: string, token: string, limit: number, windowSeconds: number) {
  const { ip } = await requestMeta();
  const res = await rateLimit(
    `sign:${scope}:${ip ?? "unknown"}:${token.slice(0, 12)}`,
    limit,
    windowSeconds,
  );
  return !res.allowed;
}

const docEventSchema = z.object({
  documentId: z.uuid(),
  type: z.enum(["document_viewed", "scrolled_to_end"]),
});

export async function recordDocumentEvent(token: string, raw: unknown): Promise<{ ok: boolean }> {
  const parsed = docEventSchema.safeParse(raw);
  if (!parsed.success || (await limited("event", token, 60, 60))) return { ok: false };
  const ctx = await resolveSigningToken(token);
  if (ctx.state !== "ready" || !ctx.documents?.some((d) => d.id === parsed.data.documentId))
    return { ok: false };
  const { ip, userAgent } = await requestMeta();
  const { error } = await createAdminClient().rpc("record_signer_event", {
    p_token_hash: ctx.tokenHash,
    p_type: parsed.data.type,
    p_metadata: { document: parsed.data.documentId },
    p_ip: ip ?? undefined,
    p_user_agent: userAgent ?? undefined,
  });
  return { ok: !error };
}

export async function completeSignature(
  token: string,
  raw: unknown,
): Promise<{ ok: true; allSigned: boolean } | Fail> {
  if (await limited("complete", token, 10, 300)) return { ok: false, error: "rate_limited" };
  const parsed = completeSignatureSchema.safeParse(raw);
  if (!parsed.success) {
    const biometric = parsed.error.issues.find((i) => i.path[0] === "biometrics");
    return { ok: false, error: biometric ? `biometrics:${biometric.message}` : "validation" };
  }
  const ctx = await resolveSigningToken(token);
  if (ctx.state !== "ready" || !ctx.signer || !ctx.envelope)
    return { ok: false, error: "state", state: ctx.state };

  const image = await normaliseSignaturePng(parsed.data.signaturePng);
  if (!image) return { ok: false, error: "signature_image" };

  const { ip, userAgent, geo } = await requestMeta();
  const admin = createAdminClient();
  const owner = ctx.envelope.userId ?? "detached";
  const biometricJson = Buffer.from(canonicalJson(parsed.data.biometrics), "utf8");
  const biometricSha = sha256Hex(biometricJson);
  const metrics = computeMetrics(parsed.data.biometrics);
  const encrypted = encryptEvidence(biometricJson);

  const bioPath = paths.biometrics(owner, ctx.envelope.id, ctx.signer.id);
  const pngPath = paths.signatureImage(owner, ctx.envelope.id, ctx.signer.id);
  const [bioUp, pngUp] = await Promise.all([
    admin.storage
      .from(BUCKETS.evidence)
      .upload(bioPath, encrypted.data, { contentType: "application/octet-stream", upsert: true }),
    admin.storage
      .from(BUCKETS.evidence)
      .upload(pngPath, image.png, { contentType: "image/png", upsert: true }),
  ]);
  if (bioUp.error || pngUp.error) {
    console.error("[sign] evidence upload failed", bioUp.error?.message, pngUp.error?.message);
    return { ok: false, error: "storage" };
  }

  const meta = parsed.data.clientMeta;
  const { data, error } = await admin.rpc("complete_signature", {
    p_token_hash: ctx.tokenHash,
    p_consent_version: parsed.data.consentVersion,
    p_ip: ip ?? undefined,
    p_user_agent: userAgent ?? undefined,
    p_evidence: {
      biometric_data_path: bioPath,
      biometric_sha256: biometricSha,
      biometric_key_id: encrypted.keyId,
      signature_image_path: pngPath,
      signature_image_sha256: image.sha256,
      stroke_count: metrics.strokeCount,
      duration_ms: metrics.durationMs,
      points_count: metrics.pointsCount,
      device_type: meta.deviceType ?? null,
      geo_country: geo.country,
      geo_region: geo.region,
      geo_city: geo.city,
      screen_w: meta.screenW ?? null,
      screen_h: meta.screenH ?? null,
      pointer_type: metrics.pointerType,
      pressure_supported: metrics.pressureSupported,
      timezone: meta.timezone ?? null,
      client_time: meta.clientTime ?? null,
    },
  });
  if (error) {
    const state = stateFromSqlError(error.message);
    if (state === "error") console.error("[sign] complete_signature", error.message);
    return {
      ok: false,
      error: state === "error" ? "generic" : "state",
      state: state === "error" ? undefined : state,
    };
  }

  const result = data as {
    all_signed: boolean;
    next_signer_id: string | null;
    envelope_id: string;
  };
  after(async () => {
    try {
      if (result.next_signer_id) await issueTokenAndEmail(admin, result.next_signer_id);
      if (result.all_signed) await closeEnvelope(result.envelope_id);
    } catch (e) {
      // The close_envelope job stays queued; the cron retries it.
      console.error("[sign] post-signature work failed", e);
    }
  });
  return { ok: true, allSigned: result.all_signed };
}

export async function declineSignature(
  token: string,
  reasonRaw: unknown,
): Promise<{ ok: true } | Fail> {
  if (await limited("decline", token, 5, 300)) return { ok: false, error: "rate_limited" };
  const reason = z.string().trim().max(1000).optional().safeParse(reasonRaw);
  if (!reason.success) return { ok: false, error: "validation" };
  const ctx = await resolveSigningToken(token);
  if (ctx.state !== "ready" || !ctx.envelope || !ctx.signer)
    return { ok: false, error: "state", state: ctx.state };
  const { ip, userAgent } = await requestMeta();
  const admin = createAdminClient();
  const { error } = await admin.rpc("decline_signature", {
    p_token_hash: ctx.tokenHash,
    p_reason: reason.data ?? undefined,
    p_ip: ip ?? undefined,
    p_user_agent: userAgent ?? undefined,
  });
  if (error) {
    const state = stateFromSqlError(error.message);
    return { ok: false, error: "state", state: state === "error" ? undefined : state };
  }

  const envelope = ctx.envelope;
  const signer = ctx.signer;
  after(async () => {
    if (!envelope.userId) return;
    const { data: sender } = await admin
      .from("profiles")
      .select("email, locale")
      .eq("id", envelope.userId)
      .maybeSingle();
    if (!sender) return;
    const locale = sender.locale === "en" ? "en" : "es";
    await sendEnvelopeNotice(sender.email, {
      locale,
      kind: "declined",
      title: envelope.title,
      signerName: `${signer.firstName} ${signer.lastName}`,
      signerEmail: signer.email,
      reason: reason.data ?? null,
      envelopeUrl: appUrl(
        getPathname({
          href: { pathname: "/app/envelopes/[id]", params: { id: envelope.id } },
          locale,
        }),
      ),
    });
  });
  return { ok: true };
}

export type SigningStatus = {
  phase: "waiting_others" | "generating" | "sealing" | "done";
  downloads: { label: string; kind: "document" | "evidence"; url: string }[];
};

/** Polled by the success screen while the envelope is being closed. */
export async function getSigningStatus(token: string): Promise<SigningStatus | null> {
  if (await limited("status", token, 120, 60)) return null;
  const ctx = await resolveSigningToken(token);
  if (!ctx.envelope || !ctx.signer || ctx.signer.status !== "signed") return null;
  const admin = createAdminClient();
  const { data: envelope } = await admin
    .from("envelopes")
    .select("status, all_signed_at")
    .eq("id", ctx.envelope.id)
    .single();
  if (!envelope?.all_signed_at) return { phase: "waiting_others", downloads: [] };
  if (envelope.status !== "completed") return { phase: "generating", downloads: [] };

  const { data: artifacts } = await admin
    .from("signed_documents")
    .select("kind, signed_path, tsa_status, documents(name, order_index)")
    .eq("envelope_id", ctx.envelope.id);
  const sorted = (artifacts ?? []).sort((a, b) =>
    a.kind === b.kind
      ? (a.documents?.order_index ?? 0) - (b.documents?.order_index ?? 0)
      : a.kind === "document"
        ? -1
        : 1,
  );
  const downloads: SigningStatus["downloads"] = [];
  for (const a of sorted) {
    const base = safeFileName(
      (a.kind === "evidence" ? "evidence" : (a.documents?.name ?? "document")).replace(
        /\.pdf$/i,
        "",
      ),
    );
    const { data } = await admin.storage
      .from(BUCKETS.signed)
      .createSignedUrl(a.signed_path, LIMITS.signerUrlTtlSeconds, {
        download: a.kind === "evidence" ? `${base}.pdf` : `${base}-firmado.pdf`,
      });
    if (data)
      downloads.push({
        label: a.kind === "evidence" ? "evidence" : (a.documents?.name ?? "document.pdf"),
        kind: a.kind,
        url: data.signedUrl,
      });
  }
  const sealing = (artifacts ?? []).some((a) => a.tsa_status !== "granted");
  return { phase: sealing ? "sealing" : "done", downloads };
}
