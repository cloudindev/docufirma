"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, fail, ok, zodFieldErrors } from "@/lib/actions/result";
import { getSessionUser } from "@/lib/auth/session";
import { LIMITS } from "@/lib/config";
import { processUpload } from "@/lib/envelopes/documents";
import {
  envelopeSettingsSchema,
  finalizeUploadSchema,
  sendEnvelopeSchema,
  titleFromFileName,
  uploadRequestSchema,
} from "@/lib/envelopes/schemas";
import { sendDraftEnvelope } from "@/lib/envelopes/send";
import { logEvent } from "@/lib/events";
import { BUCKETS, paths } from "@/lib/storage/paths";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function ownedDraft(envelopeId: string) {
  const user = await getSessionUser();
  if (!user || !z.uuid().safeParse(envelopeId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("envelopes")
    .select("id, user_id, status, title")
    .eq("id", envelopeId)
    .maybeSingle();
  if (!data || data.user_id !== user.id || data.status !== "draft") return null;
  return { user, envelope: data };
}

/**
 * Step 1: reserve an upload slot. Creates the draft on the first file. Returns a signed
 * upload URL token so the browser uploads straight to Storage (bypasses the 4.5 MB
 * serverless body limit).
 */
export async function requestUpload(
  raw: unknown,
): Promise<ActionResult<{ envelopeId: string; uploadPath: string; token: string }>> {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized");
  const parsed = uploadRequestSchema.safeParse(raw);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.path[0] === "size" ? "too_large" : "validation");

  const supabase = await createClient();
  const admin = createAdminClient();
  let envelopeId = parsed.data.envelopeId;

  if (envelopeId) {
    const owned = await ownedDraft(envelopeId);
    if (!owned) return fail("not_found");
    const { count } = await admin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("envelope_id", envelopeId);
    if ((count ?? 0) >= LIMITS.maxDocumentsPerEnvelope) return fail("too_many_documents");
  } else {
    const { data: profile } = await supabase
      .from("profiles")
      .select("locale")
      .eq("id", user.id)
      .single();
    const { data: created, error } = await supabase
      .from("envelopes")
      .insert({ title: titleFromFileName(parsed.data.fileName), locale: profile?.locale ?? "es" })
      .select("id")
      .single();
    if (error || !created) return fail("generic");
    envelopeId = created.id;
    await logEvent(admin, { envelopeId, type: "created" });
  }

  const uploadPath = paths.upload(user.id, envelopeId, randomUUID());
  const { data, error } = await admin.storage
    .from(BUCKETS.originals)
    .createSignedUploadUrl(uploadPath);
  if (error || !data) return fail("generic");
  return ok({ envelopeId, uploadPath, token: data.token });
}

/** Step 2: validate / convert the uploaded file and register it as a document. */
export async function finalizeUpload(
  raw: unknown,
): Promise<
  ActionResult<{ id: string; name: string; pageCount: number; sizeBytes: number; sha256: string }>
> {
  const parsed = finalizeUploadSchema.safeParse(raw);
  if (!parsed.success) return fail("validation");
  const owned = await ownedDraft(parsed.data.envelopeId);
  if (!owned) return fail("not_found");
  if (!parsed.data.uploadPath.startsWith(`${owned.user.id}/${parsed.data.envelopeId}/uploads/`))
    return fail("validation");

  const admin = createAdminClient();
  const { data: last } = await admin
    .from("documents")
    .select("order_index")
    .eq("envelope_id", parsed.data.envelopeId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const res = await processUpload(admin, {
    userId: owned.user.id,
    envelopeId: parsed.data.envelopeId,
    uploadPath: parsed.data.uploadPath,
    fileName: parsed.data.fileName,
    orderIndex: (last?.order_index ?? -1) + 1,
  });
  if (!res.ok) return fail(res.error);
  if (!owned.envelope.title) {
    await admin
      .from("envelopes")
      .update({ title: titleFromFileName(res.document.name) })
      .eq("id", parsed.data.envelopeId);
  }
  // No revalidatePath here: the wizard URL was swapped client-side to /app/send/[id] and a
  // server refresh would remount it mid-edit. Lists are revalidated when the envelope is sent.
  return ok({
    id: res.document.id,
    name: res.document.name,
    pageCount: res.document.page_count,
    sizeBytes: res.document.size_bytes,
    sha256: res.document.original_sha256,
  });
}

export async function removeDocument(
  envelopeId: string,
  documentId: string,
): Promise<ActionResult> {
  const owned = await ownedDraft(envelopeId);
  if (!owned || !z.uuid().safeParse(documentId).success) return fail("not_found");
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("original_path")
    .eq("id", documentId)
    .eq("envelope_id", envelopeId)
    .maybeSingle();
  if (!doc) return fail("not_found");
  await admin.from("documents").delete().eq("id", documentId);
  await admin.storage.from(BUCKETS.originals).remove([doc.original_path]);
  return ok();
}

export async function reorderDocuments(envelopeId: string, ids: string[]): Promise<ActionResult> {
  const owned = await ownedDraft(envelopeId);
  if (!owned || !z.array(z.uuid()).max(LIMITS.maxDocumentsPerEnvelope).safeParse(ids).success)
    return fail("not_found");
  const supabase = await createClient();
  await Promise.all(
    ids.map((id, index) =>
      supabase
        .from("documents")
        .update({ order_index: index })
        .eq("id", id)
        .eq("envelope_id", envelopeId),
    ),
  );
  return ok();
}

export async function getDocumentPreviewUrl(
  envelopeId: string,
  documentId: string,
): Promise<ActionResult<{ url: string }>> {
  const user = await getSessionUser();
  if (!user || !z.uuid().safeParse(documentId).success) return fail("not_found");
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("original_path")
    .eq("id", documentId)
    .eq("envelope_id", envelopeId)
    .maybeSingle();
  if (!doc) return fail("not_found");
  const { data } = await createAdminClient()
    .storage.from(BUCKETS.originals)
    .createSignedUrl(doc.original_path, 300);
  return data ? ok({ url: data.signedUrl }) : fail("generic");
}

/** Autosave of step 2 (settings + valid signers). */
export async function saveDraft(envelopeId: string, raw: unknown): Promise<ActionResult> {
  const owned = await ownedDraft(envelopeId);
  if (!owned) return fail("not_found");
  const parsed = envelopeSettingsSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
  const d = parsed.data;
  const admin = createAdminClient();
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
  if (error) return fail("generic");

  // Drafts own their signer list: replace it wholesale (duplicates by email are collapsed).
  const unique = [...new Map(d.signers.map((s) => [s.email.toLowerCase(), s])).values()];
  await admin.from("signers").delete().eq("envelope_id", envelopeId);
  if (unique.length) {
    const { error: sErr } = await admin.from("signers").insert(
      unique.map((s, i) => ({
        envelope_id: envelopeId,
        first_name: s.firstName,
        last_name: s.lastName,
        email: s.email,
        order_index: i,
      })),
    );
    if (sErr) return fail("generic");
  }
  return ok();
}

export async function sendEnvelope(
  envelopeId: string,
  raw: unknown,
): Promise<
  | ActionResult<{ notified: number }>
  | { ok: false; error: "insufficient_credits"; needed: number; available: number }
> {
  const owned = await ownedDraft(envelopeId);
  if (!owned) return fail("not_found");
  if (!owned.user.emailVerified) return fail("email_not_verified");
  const parsed = sendEnvelopeSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));

  const saved = await saveDraft(envelopeId, parsed.data);
  if (!saved.ok) return saved;

  const admin = createAdminClient();
  const res = await sendDraftEnvelope(admin, owned.user.id, envelopeId);
  if (!res.ok) {
    if (res.error === "insufficient_credits") return res;
    return fail(res.error);
  }
  revalidatePath("/[locale]/app", "layout");
  return ok({ notified: res.notified });
}
