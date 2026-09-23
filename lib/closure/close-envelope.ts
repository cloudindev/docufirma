import "server-only";
import { sendEnvelopeCompleted } from "@/lib/email";
import { appUrl } from "@/lib/env-public";
import { logEvent } from "@/lib/events";
import { getPathname } from "@/lib/i18n/navigation";
import type { EvidenceData } from "@/lib/pdf/evidence-model";
import { generateEvidencePdf } from "@/lib/pdf/evidence";
import { addDocTimeStamp } from "@/lib/pdf/pades";
import { generateSignedPdf } from "@/lib/pdf/signed-document";
import { sha256Hex } from "@/lib/signing/tokens";
import { BUCKETS, paths, safeFileName } from "@/lib/storage/paths";
import { type AdminSupabase, createAdminClient } from "@/lib/supabase/admin";
import { timestampBytes, timestampTokenForDigest } from "@/lib/tsa";
import { LIMITS } from "@/lib/config";
import type { Tables } from "@/types/database";

/** Retry schedule for failed timestamps (spec §9.2.4): 1 min, 5 min, 30 min, 2 h, 24 h. */
export const TSA_BACKOFF_MINUTES = [1, 5, 30, 120, 1440];

/**
 * Optional PAdES document timestamp (/DocTimeStamp, ETSI.RFC3161) so PDF readers show it
 * (D-025). Off by default: it costs one extra TSA stamp per document. Failures never block
 * closure: the detached RFC 3161 timestamp over the final hash remains the legal evidence.
 */
async function withDocTimeStamp(pdf: Uint8Array, envelopeId: string): Promise<Uint8Array> {
  if (process.env.PADES_DOC_TIMESTAMP !== "true") return pdf;
  try {
    return await addDocTimeStamp(pdf, timestampTokenForDigest);
  } catch (error) {
    console.warn(`[closure] PAdES timestamp skipped for ${envelopeId}:`, error);
    return pdf;
  }
}

const closeKey = (envelopeId: string) => `close_envelope:${envelopeId}`;
const tsaKey = (artifactId: string) => `retry_tsa:${artifactId}`;

async function download(admin: AdminSupabase, bucket: string, path: string) {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download ${bucket}/${path}: ${error?.message ?? "empty"}`);
  return new Uint8Array(await data.arrayBuffer());
}

async function upload(
  admin: AdminSupabase,
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType: string,
) {
  const { error } = await admin.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
}

async function loadEvidence(admin: AdminSupabase, envelopeId: string) {
  const { data: envelope } = await admin
    .from("envelopes")
    .select("*")
    .eq("id", envelopeId)
    .single();
  if (!envelope) throw new Error("envelope not found");
  const [{ data: documents }, { data: signers }, { data: evidence }, { data: events }] =
    await Promise.all([
      admin.from("documents").select("*").eq("envelope_id", envelopeId).order("order_index"),
      admin.from("signers").select("*").eq("envelope_id", envelopeId).order("order_index"),
      admin.from("signature_evidence").select("*").eq("envelope_id", envelopeId),
      admin.from("envelope_events").select("*").eq("envelope_id", envelopeId).order("created_at"),
    ]);
  return {
    envelope,
    documents: documents ?? [],
    signers: signers ?? [],
    evidence: evidence ?? [],
    events: events ?? [],
  };
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "docufirma.es";
  }
}

async function buildEvidenceData(
  admin: AdminSupabase,
  ctx: Awaited<ReturnType<typeof loadEvidence>>,
): Promise<EvidenceData> {
  const { envelope, documents, signers, evidence, events } = ctx;
  const locale = envelope.locale === "en" ? "en" : "es";
  const verifyUrl = appUrl(
    `${getPathname({ href: "/verify", locale })}?code=${envelope.verification_code}`,
  );
  const byId = new Map(evidence.map((e) => [e.signer_id, e]));
  const signerNames = new Map(signers.map((s) => [s.id, `${s.first_name} ${s.last_name}`]));
  const docNames = new Map(documents.map((d) => [d.id, d.name]));

  const signerData = await Promise.all(
    signers.map(async (s) => {
      const ev = byId.get(s.id);
      if (!ev || !ev.signature_image_path) throw new Error(`missing evidence for signer ${s.id}`);
      return {
        id: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        email: s.email,
        orderIndex: s.order_index,
        signedAt: s.signed_at ?? ev.server_time,
        signatureImage: await download(admin, BUCKETS.evidence, ev.signature_image_path),
        ip: ev.ip as string | null,
        geo: { country: ev.geo_country, region: ev.geo_region, city: ev.geo_city },
        userAgent: ev.user_agent,
        deviceType: ev.device_type,
        screen: { w: ev.screen_w, h: ev.screen_h },
        timezone: ev.timezone,
        pointerType: ev.pointer_type,
        pressureSupported: ev.pressure_supported,
        strokeCount: ev.stroke_count,
        pointsCount: ev.points_count,
        durationMs: ev.duration_ms,
        biometricSha256: ev.biometric_sha256,
        consentVersion: s.consent_text_version,
        consentAcceptedAt: s.consent_accepted_at,
      };
    }),
  );

  return {
    locale,
    host: hostOf(appUrl()),
    verifyUrl,
    envelope: {
      id: envelope.id,
      title: envelope.title,
      verificationCode: envelope.verification_code ?? "",
      createdAt: envelope.created_at,
      sentAt: envelope.sent_at,
      completedAt: envelope.all_signed_at ?? new Date().toISOString(),
      sequential: envelope.sequential,
    },
    sender: {
      name: envelope.sender_name ?? "—",
      email: envelope.sender_email,
      company: envelope.sender_company,
    },
    documents: documents.map((d) => ({
      id: d.id,
      name: d.name,
      pageCount: d.page_count,
      originalSha256: d.original_sha256,
    })),
    signers: signerData,
    events: events
      .filter((e) => !["downloaded", "email_delivered"].includes(e.type))
      .map((e) => {
        const meta = (e.metadata ?? {}) as Record<string, unknown>;
        return {
          type: e.type,
          createdAt: e.created_at,
          signerName: e.signer_id ? (signerNames.get(e.signer_id) ?? null) : null,
          documentName:
            typeof meta.document === "string" ? (docNames.get(meta.document) ?? null) : null,
          ip: e.ip as string | null,
        };
      }),
  };
}

/** Timestamps one artifact; on failure records it and schedules a retry job. */
export async function timestampArtifact(
  admin: AdminSupabase,
  artifact: Tables<"signed_documents">,
  owner: string,
  opts: { enqueueRetry?: boolean } = {},
) {
  try {
    const bytes = await download(admin, BUCKETS.signed, artifact.signed_path);
    if (sha256Hex(bytes) !== artifact.signed_sha256)
      throw new Error("stored PDF does not match its recorded hash");
    const result = await timestampBytes(bytes);
    const tsqPath = paths.tsq(owner, artifact.envelope_id, artifact.id);
    const tsrPath = paths.tsr(owner, artifact.envelope_id, artifact.id);
    await upload(admin, BUCKETS.tsa, tsqPath, result.tsq, "application/timestamp-query");
    await upload(admin, BUCKETS.tsa, tsrPath, result.tsr, "application/timestamp-reply");
    await admin.rpc("record_tsa_result", {
      p_artifact_id: artifact.id,
      p_granted: true,
      p_fields: {
        provider: result.provider,
        tsq_path: tsqPath,
        tsr_path: tsrPath,
        serial: result.parsed.serialNumber,
        gen_time: result.parsed.genTime?.toISOString() ?? null,
        policy_oid: result.parsed.policyOid,
        tsa_name: result.parsed.tsaName,
        hash_alg: result.parsed.hashAlg,
      },
    });
    await logEvent(admin, {
      envelopeId: artifact.envelope_id,
      type: "tsa_granted",
      metadata: {
        artifact: artifact.id,
        kind: artifact.kind,
        provider: result.provider,
        serial: result.parsed.serialNumber,
        gen_time: result.parsed.genTime?.toISOString() ?? null,
      },
    });
    return {
      granted: true as const,
      provider: result.provider,
      genTime: result.parsed.genTime,
      serial: result.parsed.serialNumber,
      tsaName: result.parsed.tsaName,
    };
  } catch (error) {
    const attempt = artifact.tsa_attempts + 1;
    const delay = TSA_BACKOFF_MINUTES[Math.min(attempt - 1, TSA_BACKOFF_MINUTES.length - 1)]!;
    const next =
      attempt <= TSA_BACKOFF_MINUTES.length ? new Date(Date.now() + delay * 60_000) : null;
    const message = (error as Error).message;
    await admin.rpc("record_tsa_result", {
      p_artifact_id: artifact.id,
      p_granted: false,
      p_fields: {},
      p_error: message,
      p_next_attempt_at: next?.toISOString() ?? undefined,
    });
    if (next && opts.enqueueRetry !== false) {
      await admin.rpc("enqueue_job", {
        p_type: "retry_tsa",
        p_payload: { artifact_id: artifact.id },
        p_run_at: next.toISOString(),
        p_dedupe_key: tsaKey(artifact.id),
      });
    }
    await logEvent(admin, {
      envelopeId: artifact.envelope_id,
      type: "tsa_failed",
      metadata: { artifact: artifact.id, attempt, error: message.slice(0, 300) },
    });
    if (attempt >= 3) {
      // Surfaced to Sentry by the console integration (Phase 8) — third consecutive failure.
      console.error(`[tsa] artifact ${artifact.id} failed ${attempt} times: ${message}`);
    }
    return { granted: false as const, error: message, nextAttemptAt: next };
  }
}

async function sendCompletionEmails(admin: AdminSupabase, envelopeId: string) {
  const { data: envelope } = await admin
    .from("envelopes")
    .select("*")
    .eq("id", envelopeId)
    .single();
  if (!envelope?.verification_code) return;
  const [{ data: signers }, { data: artifacts }, { data: profile }] = await Promise.all([
    admin.from("signers").select("first_name, last_name, email").eq("envelope_id", envelopeId),
    admin
      .from("signed_documents")
      .select("*, documents(name, order_index)")
      .eq("envelope_id", envelopeId),
    envelope.user_id
      ? admin
          .from("profiles")
          .select("email, locale, notify_on_complete, logo_path")
          .eq("id", envelope.user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const locale = envelope.locale === "en" ? "en" : "es";
  const sorted = (artifacts ?? []).sort((a, b) =>
    a.kind === b.kind
      ? (a.documents?.order_index ?? 0) - (b.documents?.order_index ?? 0)
      : a.kind === "document"
        ? -1
        : 1,
  );
  const files: { label: string; url: string }[] = [];
  for (const a of sorted) {
    const base = safeFileName(
      (a.kind === "evidence" ? "evidence" : (a.documents?.name ?? "document")).replace(
        /\.pdf$/i,
        "",
      ),
    );
    const { data } = await admin.storage
      .from(BUCKETS.signed)
      .createSignedUrl(a.signed_path, LIMITS.emailDownloadUrlTtlSeconds, {
        download: a.kind === "evidence" ? `${base}.pdf` : `${base}-firmado.pdf`,
      });
    if (!data) continue;
    files.push({
      label:
        a.kind === "evidence"
          ? locale === "en"
            ? "Evidence certificate"
            : "Certificado de evidencias"
          : `${locale === "en" ? "Signed PDF" : "PDF firmado"} · ${a.documents?.name ?? ""}`,
      url: data.signedUrl,
    });
  }
  const granted = sorted.find((a) => a.kind === "document" && a.tsa_status === "granted");
  const tsa = granted?.tsa_gen_time
    ? {
        authority: granted.tsa_name ?? granted.tsa_provider ?? "TSA",
        genTime: granted.tsa_gen_time,
        serial: granted.tsa_serial ?? "",
      }
    : null;
  const verifyUrl = appUrl(
    `${getPathname({ href: "/verify", locale })}?code=${envelope.verification_code}`,
  );
  const logoUrl =
    envelope.user_id && profile?.logo_path ? appUrl(`/api/branding/${envelope.user_id}`) : null;

  for (const s of signers ?? []) {
    await sendEnvelopeCompleted(
      s.email,
      {
        locale,
        logoUrl,
        audience: "signer",
        recipientName: s.first_name,
        title: envelope.title,
        verificationCode: envelope.verification_code,
        verifyUrl,
        files,
        tsa,
      },
      {
        replyTo: envelope.sender_email ?? undefined,
        fromName: envelope.sender_name
          ? `${envelope.sender_name} ${locale === "en" ? "via" : "vía"} DocuFirma`
          : undefined,
      },
    );
  }
  if (profile && profile.notify_on_complete) {
    const senderLocale = profile.locale === "en" ? "en" : "es";
    await sendEnvelopeCompleted(profile.email, {
      locale: senderLocale,
      logoUrl,
      audience: "sender",
      recipientName: envelope.sender_name ?? "",
      title: envelope.title,
      verificationCode: envelope.verification_code,
      verifyUrl,
      appEnvelopeUrl: appUrl(
        getPathname({
          href: { pathname: "/app/envelopes/[id]", params: { id: envelopeId } },
          locale: senderLocale,
        }),
      ),
      files,
      tsa,
    });
  }
}

/**
 * Closes a fully signed envelope (spec §9): signed PDFs + evidence certificate → completed →
 * RFC 3161 timestamps (retried by the cron on failure) → completion emails. Idempotent and
 * safe to call concurrently: it claims the envelope's close job first.
 */
export async function closeEnvelope(
  envelopeId: string,
  admin: AdminSupabase = createAdminClient(),
) {
  const { data: claimed } = await admin.rpc("claim_job_by_key", {
    p_dedupe_key: closeKey(envelopeId),
  });
  const job = claimed?.[0];
  if (!job) return { skipped: true as const };

  try {
    const ctx = await loadEvidence(admin, envelopeId);
    if (!ctx.envelope.all_signed_at) throw new Error("envelope is not fully signed");
    const owner = ctx.envelope.user_id ?? "detached";
    const { data: existing } = await admin
      .from("signed_documents")
      .select("*")
      .eq("envelope_id", envelopeId);
    const granted = new Set(
      (existing ?? [])
        .filter((a) => a.tsa_status === "granted")
        .map((a) => a.document_id ?? "evidence"),
    );

    const data = await buildEvidenceData(admin, ctx);

    // 1. Signed PDFs (skip those already sealed: their bytes are fixed forever).
    for (const doc of ctx.documents) {
      const current = (existing ?? []).find(
        (a) => a.kind === "document" && a.document_id === doc.id,
      );
      if (current && granted.has(doc.id)) {
        data.documents.find((d) => d.id === doc.id)!.signedSha256 = current.signed_sha256;
        continue;
      }
      const original = await download(admin, BUCKETS.originals, doc.original_path);
      if (sha256Hex(original) !== doc.original_sha256)
        throw new Error(`original ${doc.id} does not match its hash`);
      const signed = await withDocTimeStamp(
        await generateSignedPdf(
          original,
          data,
          data.documents.find((d) => d.id === doc.id)!,
        ),
        envelopeId,
      );
      const signedPath = paths.signed(owner, envelopeId, doc.id);
      const signedSha = sha256Hex(signed);
      await upload(admin, BUCKETS.signed, signedPath, signed, "application/pdf");
      data.documents.find((d) => d.id === doc.id)!.signedSha256 = signedSha;
      const row = {
        envelope_id: envelopeId,
        kind: "document" as const,
        document_id: doc.id,
        signed_path: signedPath,
        signed_sha256: signedSha,
        size_bytes: signed.byteLength,
        tsa_status: "pending" as const,
      };
      if (current) await admin.from("signed_documents").update(row).eq("id", current.id);
      else await admin.from("signed_documents").insert(row);
    }

    // 2. Evidence certificate (includes the signed hashes).
    const currentEvidence = (existing ?? []).find((a) => a.kind === "evidence");
    let evidencePath = currentEvidence?.signed_path ?? paths.evidencePdf(owner, envelopeId);
    let evidenceSha = currentEvidence?.signed_sha256 ?? "";
    if (!(currentEvidence && granted.has("evidence"))) {
      const evidencePdf = await generateEvidencePdf(data);
      evidencePath = paths.evidencePdf(owner, envelopeId);
      evidenceSha = sha256Hex(evidencePdf);
      await upload(admin, BUCKETS.signed, evidencePath, evidencePdf, "application/pdf");
      const row = {
        envelope_id: envelopeId,
        kind: "evidence" as const,
        document_id: null,
        signed_path: evidencePath,
        signed_sha256: evidenceSha,
        size_bytes: evidencePdf.byteLength,
        tsa_status: "pending" as const,
      };
      if (currentEvidence)
        await admin.from("signed_documents").update(row).eq("id", currentEvidence.id);
      else await admin.from("signed_documents").insert(row);
    }
    await admin
      .from("signed_documents")
      .update({ evidence_pdf_path: evidencePath, evidence_sha256: evidenceSha })
      .eq("envelope_id", envelopeId)
      .eq("kind", "document");

    // 3. Completed (documents downloadable from now on).
    const { data: newlyCompleted } = await admin.rpc("mark_envelope_completed", {
      p_envelope_id: envelopeId,
    });

    // 4. Qualified timestamps (failures are retried by the cron).
    const { data: artifacts } = await admin
      .from("signed_documents")
      .select("*")
      .eq("envelope_id", envelopeId)
      .neq("tsa_status", "granted");
    for (const artifact of artifacts ?? []) await timestampArtifact(admin, artifact, owner);

    // 5. Emails, once.
    if (newlyCompleted) await sendCompletionEmails(admin, envelopeId);

    await admin.rpc("complete_job", { p_job_id: job.id });
    return { skipped: false as const, completed: true };
  } catch (error) {
    const message = (error as Error).message;
    console.error(`[close] envelope ${envelopeId}: ${message}`);
    await admin.rpc("fail_job", {
      p_job_id: job.id,
      p_error: message,
      p_retry_at: new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60_000).toISOString(),
    });
    throw error;
  }
}

/** Cron worker: pending/stuck close jobs. */
export async function processCloseJobs(limit = 5) {
  const admin = createAdminClient();
  const { data: jobs } = await admin
    .from("jobs")
    .select("payload")
    .eq("type", "close_envelope")
    .in("status", ["pending", "running"])
    .lte("run_at", new Date().toISOString())
    .limit(limit);
  const results: { envelopeId: string; ok: boolean }[] = [];
  for (const job of jobs ?? []) {
    const envelopeId = (job.payload as { envelope_id?: string }).envelope_id;
    if (!envelopeId) continue;
    try {
      await closeEnvelope(envelopeId, admin);
      results.push({ envelopeId, ok: true });
    } catch {
      results.push({ envelopeId, ok: false });
    }
  }
  return results;
}

/** Cron worker: due TSA retries. */
export async function processTsaRetries(limit = 10) {
  const admin = createAdminClient();
  const { data: jobs } = await admin.rpc("claim_jobs", { p_type: "retry_tsa", p_limit: limit });
  const results: { artifactId: string; granted: boolean }[] = [];
  for (const job of jobs ?? []) {
    const artifactId = (job.payload as { artifact_id?: string }).artifact_id;
    const { data: artifact } = artifactId
      ? await admin
          .from("signed_documents")
          .select("*, envelopes(user_id)")
          .eq("id", artifactId)
          .maybeSingle()
      : { data: null };
    if (!artifact || artifact.tsa_status === "granted") {
      await admin.rpc("complete_job", { p_job_id: job.id });
      continue;
    }
    const owner = artifact.signed_path.split("/")[0] ?? "detached";
    const res = await timestampArtifact(admin, artifact, owner, { enqueueRetry: false });
    if (res.granted) await admin.rpc("complete_job", { p_job_id: job.id });
    else
      await admin.rpc("fail_job", {
        p_job_id: job.id,
        p_error: res.error,
        // Rescheduled per the backoff table; no next attempt left → permanently failed.
        p_retry_at: res.nextAttemptAt?.toISOString() ?? undefined,
      });
    results.push({ artifactId: artifact.id, granted: res.granted });
  }
  return results;
}
