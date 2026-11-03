import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { LIMITS } from "@/lib/config";
import { getCredits, getSmsBalance, hasActivePlan } from "@/lib/credits";
import { processUpload } from "@/lib/envelopes/documents";
import {
  checkSendPreconditions,
  deleteDraftEnvelope,
  loadEnvelopeSettings,
  remindPendingSigners,
  startInPersonSession,
  writeDraftSettings,
} from "@/lib/envelopes/operations";
import {
  type EnvelopeSettingsInput,
  envelopeSettingsSchema,
  sendEnvelopeSchema,
  titleFromFileName,
} from "@/lib/envelopes/schemas";
import { sendDraftEnvelope } from "@/lib/envelopes/send";
import { logEvent } from "@/lib/events";
import { BUCKETS, paths, safeFileName } from "@/lib/storage/paths";
import { fullName } from "@/lib/utils";
import type { Tables } from "@/types/database";
import type { ApiContext } from "./auth";
import { ApiError, notFound } from "./http";
import {
  type CreateEnvelopeIn,
  documentIn,
  INLINE_MAX_BYTES,
  type UpdateEnvelopeIn,
} from "./schemas";
import {
  DOCUMENT_COLUMNS,
  SIGNER_COLUMNS,
  serializeDocument,
  serializeEnvelope,
} from "./serialize";
import { dispatchEnvelopeEvent } from "./webhooks";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SNAKE: Record<string, string> = {
  firstName: "first_name",
  lastName: "last_name",
  requireSmsOtp: "require_sms_otp",
  expiryDays: "expiry_days",
  reminderDays: "reminder_days",
};

function invalid(issues: { path: PropertyKey[]; message: string }[], extra?: object) {
  return new ApiError(422, "validation_error", "The envelope is not valid.", {
    ...extra,
    issues: issues.map((i) => ({
      field: i.path.map((p) => SNAKE[String(p)] ?? String(p)).join("."),
      message: i.message,
    })),
  });
}

export async function ownedEnvelope(ctx: ApiContext, id: string): Promise<Tables<"envelopes">> {
  if (!UUID.test(id)) throw notFound("Envelope");
  const { data } = await ctx.admin.from("envelopes").select("*").eq("id", id).maybeSingle();
  if (!data || data.user_id !== ctx.userId) throw notFound("Envelope");
  return data;
}

async function ownedDraft(ctx: ApiContext, id: string) {
  const envelope = await ownedEnvelope(ctx, id);
  if (envelope.status !== "draft")
    throw new ApiError(409, "envelope_not_draft", "Only draft envelopes can be modified.");
  return envelope;
}

export async function envelopeDetail(ctx: ApiContext, id: string) {
  const envelope = await ownedEnvelope(ctx, id);
  const [{ data: signers }, { data: documents }] = await Promise.all([
    ctx.admin.from("signers").select(SIGNER_COLUMNS).eq("envelope_id", id).order("order_index"),
    ctx.admin.from("documents").select(DOCUMENT_COLUMNS).eq("envelope_id", id).order("order_index"),
  ]);
  return serializeEnvelope(envelope, signers ?? [], documents ?? []);
}

export async function listEnvelopes(
  ctx: ApiContext,
  q: { status?: Tables<"envelopes">["status"]; limit: number; starting_after?: string },
) {
  let query = ctx.admin
    .from("envelopes")
    .select("*")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(q.limit + 1);
  if (q.status) query = query.eq("status", q.status);
  if (q.starting_after) {
    const cursor = await ownedEnvelope(ctx, q.starting_after);
    query = query.lt("created_at", cursor.created_at);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const page = rows.slice(0, q.limit);
  const ids = page.map((e) => e.id);
  const { data: signers } = ids.length
    ? await ctx.admin
        .from("signers")
        .select(`envelope_id, ${SIGNER_COLUMNS}`)
        .in("envelope_id", ids)
        .order("order_index")
    : { data: [] };
  return {
    object: "list" as const,
    data: page.map((e) =>
      serializeEnvelope(
        e,
        (signers ?? []).filter((s) => s.envelope_id === e.id),
      ),
    ),
    has_more: rows.length > q.limit,
  };
}

/** Applies API settings on top of the stored ones and validates them like the app does. */
async function applySettings(ctx: ApiContext, envelopeId: string, input: UpdateEnvelopeIn) {
  const current = await loadEnvelopeSettings(ctx.admin, envelopeId);
  if (!current) throw notFound("Envelope");
  const merged: EnvelopeSettingsInput = {
    title: input.title ?? current.title,
    message: input.message ?? current.message,
    sequential: input.sequential ?? current.sequential,
    locale: input.locale ?? current.locale,
    expiryDays: input.expiry_days ?? current.expiryDays,
    reminderDays: input.reminder_days ?? current.reminderDays,
    signers: input.signers
      ? input.signers.map((s) => ({
          firstName: s.first_name,
          lastName: s.last_name,
          email: s.email,
          phone: s.phone ?? "",
          requireSmsOtp: s.require_sms_otp ?? false,
          delivery: s.delivery ?? "email",
        }))
      : current.signers,
  };
  const parsed = envelopeSettingsSchema.safeParse(merged);
  if (!parsed.success) throw invalid(parsed.error.issues, { envelope_id: envelopeId });
  if (!(await writeDraftSettings(ctx.admin, envelopeId, parsed.data)))
    throw new Error("could not save the envelope settings");
}

export async function createEnvelope(ctx: ApiContext, input: CreateEnvelopeIn) {
  const { data: profile } = await ctx.admin
    .from("profiles")
    .select("locale")
    .eq("id", ctx.userId)
    .single();
  const { data: created, error } = await ctx.admin
    .from("envelopes")
    .insert({
      user_id: ctx.userId,
      title: input.title,
      locale: input.locale ?? (profile?.locale === "en" ? "en" : "es"),
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "could not create the envelope");
  await logEvent(ctx.admin, { envelopeId: created.id, type: "created", metadata: { via: "api" } });

  await applySettings(ctx, created.id, input);
  for (const doc of input.documents ?? []) await addInlineDocument(ctx, created.id, doc);
  if (input.send) return sendEnvelope(ctx, created.id);
  return envelopeDetail(ctx, created.id);
}

export async function updateEnvelope(ctx: ApiContext, id: string, input: UpdateEnvelopeIn) {
  await ownedDraft(ctx, id);
  await applySettings(ctx, id, input);
  return envelopeDetail(ctx, id);
}

export async function deleteEnvelope(ctx: ApiContext, id: string) {
  await ownedDraft(ctx, id);
  if (!(await deleteDraftEnvelope(ctx.admin, ctx.userId, id)))
    throw new Error("could not delete the draft");
  return { id, object: "envelope" as const, deleted: true };
}

async function nextOrderIndex(ctx: ApiContext, envelopeId: string) {
  const { data: rows, count } = await ctx.admin
    .from("documents")
    .select("order_index", { count: "exact" })
    .eq("envelope_id", envelopeId)
    .order("order_index", { ascending: false })
    .limit(1);
  if ((count ?? 0) >= LIMITS.maxDocumentsPerEnvelope)
    throw new ApiError(
      422,
      "too_many_documents",
      `An envelope can hold up to ${LIMITS.maxDocumentsPerEnvelope} documents.`,
    );
  return (rows?.[0]?.order_index ?? -1) + 1;
}

const PROCESS_ERRORS: Record<string, string> = {
  not_found: "The uploaded file was not found. Upload it before completing.",
  unsupported: "Unsupported file type. Send a PDF, a PNG/JPEG/WebP image or (if enabled) a DOCX.",
  too_large: "The file is too large.",
  docx_disabled: "DOCX conversion is not enabled.",
  conversion_failed: "The file could not be converted to PDF.",
  not_pdf: "The file is not a valid PDF.",
  encrypted: "Password-protected PDFs are not supported.",
  javascript: "PDFs with JavaScript are not allowed.",
  xfa: "XFA forms are not supported.",
  corrupted: "The PDF is damaged.",
  empty: "The document has no pages.",
  too_many_pages: "The document has too many pages.",
};

async function finishUpload(ctx: ApiContext, envelopeId: string, uploadPath: string, name: string) {
  const res = await processUpload(ctx.admin, {
    userId: ctx.userId,
    envelopeId,
    uploadPath,
    fileName: name,
    orderIndex: await nextOrderIndex(ctx, envelopeId),
  });
  if (!res.ok)
    throw new ApiError(
      422,
      `document_${res.error}`,
      PROCESS_ERRORS[res.error] ?? "The document is not valid.",
      { envelope_id: envelopeId },
    );
  const { data: envelope } = await ctx.admin
    .from("envelopes")
    .select("title")
    .eq("id", envelopeId)
    .single();
  if (!envelope?.title)
    await ctx.admin
      .from("envelopes")
      .update({ title: titleFromFileName(res.document.name) })
      .eq("id", envelopeId);
  const { data: doc } = await ctx.admin
    .from("documents")
    .select(DOCUMENT_COLUMNS)
    .eq("id", res.document.id)
    .single();
  return serializeDocument(doc!);
}

export async function addInlineDocument(
  ctx: ApiContext,
  envelopeId: string,
  doc: { name: string; content_base64: string },
) {
  await ownedDraft(ctx, envelopeId);
  const parsed = documentIn.safeParse(doc);
  if (!parsed.success) throw invalid(parsed.error.issues);
  const bytes = Buffer.from(parsed.data.content_base64, "base64");
  if (bytes.byteLength === 0)
    throw new ApiError(422, "invalid_base64", "`content_base64` is empty or not valid base64.");
  if (bytes.byteLength > INLINE_MAX_BYTES)
    throw new ApiError(
      413,
      "document_too_large_inline",
      "Inline documents are limited to 3 MB. Use the upload endpoints for larger files.",
    );
  await nextOrderIndex(ctx, envelopeId); // fail fast on the document limit
  const uploadPath = paths.upload(ctx.userId, envelopeId, randomUUID());
  const { error } = await ctx.admin.storage
    .from(BUCKETS.originals)
    .upload(uploadPath, bytes, { contentType: "application/octet-stream" });
  if (error) throw new Error(`storage upload: ${error.message}`);
  return finishUpload(ctx, envelopeId, uploadPath, parsed.data.name);
}

export async function createUpload(ctx: ApiContext, envelopeId: string, name: string) {
  await ownedDraft(ctx, envelopeId);
  await nextOrderIndex(ctx, envelopeId);
  const uploadId = randomUUID();
  const { data, error } = await ctx.admin.storage
    .from(BUCKETS.originals)
    .createSignedUploadUrl(paths.upload(ctx.userId, envelopeId, uploadId));
  if (error || !data) throw new Error(`signed upload url: ${error?.message}`);
  return {
    object: "upload" as const,
    id: uploadId,
    name,
    upload_url: data.signedUrl,
    method: "PUT",
    expires_in: 7200,
  };
}

export async function completeUpload(
  ctx: ApiContext,
  envelopeId: string,
  uploadId: string,
  name: string,
) {
  await ownedDraft(ctx, envelopeId);
  if (!UUID.test(uploadId)) throw notFound("Upload");
  return finishUpload(ctx, envelopeId, paths.upload(ctx.userId, envelopeId, uploadId), name);
}

export async function sendEnvelope(ctx: ApiContext, id: string) {
  await ownedDraft(ctx, id);
  const { data: user } = await ctx.admin.auth.admin.getUserById(ctx.userId);
  if (!user?.user?.email_confirmed_at)
    throw new ApiError(403, "email_not_verified", "Confirm the account email before sending.");
  const settings = await loadEnvelopeSettings(ctx.admin, id);
  const parsed = sendEnvelopeSchema.safeParse(settings);
  if (!parsed.success) throw invalid(parsed.error.issues, { envelope_id: id });
  const blocked = await checkSendPreconditions(ctx.admin, ctx.userId, parsed.data);
  if (blocked === "subscription_required")
    throw new ApiError(403, "subscription_required", "Sending requires an active Pro plan.");
  if (blocked === "sms_unavailable")
    throw new ApiError(422, "sms_unavailable", "SMS verification is not available right now.");
  if (blocked === "sms_no_credits")
    throw new ApiError(
      402,
      "sms_no_credits",
      "Not enough SMS for the signers that require a code.",
    );

  const res = await sendDraftEnvelope(ctx.admin, ctx.userId, id);
  if (!res.ok) {
    if (res.error === "insufficient_credits")
      throw new ApiError(
        402,
        "insufficient_credits",
        "Not enough signatures to send this envelope.",
        {
          needed: res.needed,
          available: res.available,
        },
      );
    if (res.error === "not_draft")
      throw new ApiError(409, "envelope_not_draft", "The envelope has already been sent.");
    if (res.error === "no_documents")
      throw new ApiError(422, "no_documents", "Add at least one document before sending.");
    if (res.error === "no_signers")
      throw new ApiError(422, "no_signers", "Add at least one signer before sending.");
    if (res.error === "subscription_required")
      throw new ApiError(403, "subscription_required", "Sending requires an active Pro plan.");
    throw new Error("send failed");
  }
  return envelopeDetail(ctx, id);
}

export async function cancelEnvelope(ctx: ApiContext, id: string) {
  await ownedEnvelope(ctx, id);
  const { error } = await ctx.admin.rpc("cancel_envelope", {
    p_envelope_id: id,
    p_user_id: ctx.userId,
  });
  if (error) {
    if (error.message.includes("not_cancelable"))
      throw new ApiError(
        409,
        "not_cancelable",
        "Only sent envelopes that are not finished can be canceled.",
      );
    throw new Error(error.message);
  }
  after(() => dispatchEnvelopeEvent(id, "envelope.canceled"));
  return envelopeDetail(ctx, id);
}

export async function remindEnvelope(ctx: ApiContext, id: string) {
  const envelope = await ownedEnvelope(ctx, id);
  if (envelope.status !== "sent" && envelope.status !== "viewed")
    throw new ApiError(409, "not_active", "Only envelopes waiting for signatures can be reminded.");
  return {
    object: "reminder" as const,
    envelope_id: id,
    sent: await remindPendingSigners(ctx.admin, id),
  };
}

export async function inPersonUrl(ctx: ApiContext, id: string, signerId: string) {
  const envelope = await ownedEnvelope(ctx, id);
  if (!UUID.test(signerId)) throw notFound("Signer");
  const { data: profile } = await ctx.admin
    .from("profiles")
    .select("first_name, last_name, email")
    .eq("id", ctx.userId)
    .single();
  const res = await startInPersonSession(ctx.admin, {
    userId: ctx.userId,
    signerId,
    locale: envelope.locale === "en" ? "en" : "es",
    host: `${fullName(profile?.first_name, profile?.last_name) || profile?.email} <${profile?.email}> (API)`,
  });
  if (!res.ok) {
    if (res.error === "not_found")
      throw new ApiError(404, "not_found", "Signer not found or not an in-person signer.");
    if (res.error === "not_your_turn")
      throw new ApiError(
        409,
        "not_your_turn",
        "In sequential envelopes, earlier signers must sign first.",
      );
    throw new ApiError(409, "not_active", "The envelope is not waiting for this signer.");
  }
  return { object: "signing_url" as const, signer_id: signerId, url: res.url };
}

export async function envelopeFiles(ctx: ApiContext, id: string) {
  const envelope = await ownedEnvelope(ctx, id);
  const [{ data: docs }, { data: signed }] = await Promise.all([
    ctx.admin
      .from("documents")
      .select("id, name, original_path")
      .eq("envelope_id", id)
      .order("order_index"),
    ctx.admin
      .from("signed_documents")
      .select("id, kind, document_id, signed_path, tsr_path, tsa_status")
      .eq("envelope_id", id),
  ]);
  const ttl = LIMITS.downloadUrlTtlSeconds;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const url = async (bucket: string, path: string, fileName: string) => {
    const { data } = await ctx.admin.storage
      .from(bucket)
      .createSignedUrl(path, ttl, { download: safeFileName(fileName) });
    return data?.signedUrl ?? null;
  };
  const nameOf = new Map((docs ?? []).map((d) => [d.id, d.name.replace(/\.pdf$/i, "")]));
  const files: {
    type: "original" | "signed" | "evidence" | "timestamp";
    document_id: string | null;
    name: string;
    url: string | null;
    expires_at: string;
    tsa_status?: string;
  }[] = [];
  for (const d of docs ?? [])
    files.push({
      type: "original",
      document_id: d.id,
      name: d.name,
      url: await url(BUCKETS.originals, d.original_path, d.name),
      expires_at: expiresAt,
    });
  if (envelope.status === "completed") {
    for (const s of signed ?? []) {
      const base =
        s.kind === "evidence" ? "evidence" : (nameOf.get(s.document_id ?? "") ?? "document");
      const name = s.kind === "evidence" ? `${base}.pdf` : `${base}-signed.pdf`;
      files.push({
        type: s.kind === "evidence" ? "evidence" : "signed",
        document_id: s.document_id,
        name,
        url: await url(BUCKETS.signed, s.signed_path, name),
        expires_at: expiresAt,
        tsa_status: s.tsa_status,
      });
      if (s.tsa_status === "granted" && s.tsr_path)
        files.push({
          type: "timestamp",
          document_id: s.document_id,
          name: `${base}.tsr`,
          url: await url(BUCKETS.tsa, s.tsr_path, `${base}.tsr`),
          expires_at: expiresAt,
        });
    }
  }
  await logEvent(ctx.admin, { envelopeId: id, type: "downloaded", metadata: { by: "api" } });
  return { object: "list" as const, data: files };
}

export async function envelopeEvents(ctx: ApiContext, id: string) {
  await ownedEnvelope(ctx, id);
  const { data } = await ctx.admin
    .from("envelope_events")
    .select("id, type, signer_id, metadata, created_at")
    .eq("envelope_id", id)
    .order("created_at", { ascending: true })
    .limit(500);
  return {
    object: "list" as const,
    data: (data ?? []).map((e) => ({ object: "event" as const, ...e })),
  };
}

export async function account(ctx: ApiContext) {
  const [{ data: profile }, credits, sms, plan] = await Promise.all([
    ctx.admin
      .from("profiles")
      .select("email, first_name, last_name, company_name, locale")
      .eq("id", ctx.userId)
      .single(),
    getCredits(ctx.admin, ctx.userId),
    getSmsBalance(ctx.admin, ctx.userId).catch(() => 0),
    hasActivePlan(ctx.admin, ctx.userId),
  ]);
  return {
    object: "account" as const,
    email: profile?.email,
    name: fullName(profile?.first_name, profile?.last_name) || null,
    company: profile?.company_name ?? null,
    locale: profile?.locale,
    plan: { name: "pro", active: plan },
    signatures: { available: credits.total, reserved: credits.reserved },
    sms: { available: sms },
  };
}
