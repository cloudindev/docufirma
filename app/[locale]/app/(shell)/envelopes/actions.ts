"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { dispatchEnvelopeEvent } from "@/lib/api/webhooks";
import { headers } from "next/headers";
import { z } from "zod";
import { type ActionResult, fail, ok } from "@/lib/actions/result";
import { getSessionUser } from "@/lib/auth/session";
import { LIMITS } from "@/lib/config";
import {
  deleteDraftEnvelope,
  remindPendingSigners as remindNow,
  startInPersonSession,
} from "@/lib/envelopes/operations";
import { logEvent } from "@/lib/events";
import { clientIpFrom } from "@/lib/http";
import { fullName } from "@/lib/utils";
import { BUCKETS, paths, safeFileName } from "@/lib/storage/paths";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuid = z.uuid();

async function ownedEnvelope(envelopeId: string) {
  const user = await getSessionUser();
  if (!user || !uuid.safeParse(envelopeId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("envelopes")
    .select("id, user_id, status, title, message, locale, sequential, reminder_days, expires_at")
    .eq("id", envelopeId)
    .maybeSingle();
  if (!data || data.user_id !== user.id) return null;
  return { user, envelope: data };
}

export async function cancelEnvelope(
  envelopeId: string,
): Promise<ActionResult<{ released: number }>> {
  const owned = await ownedEnvelope(envelopeId);
  if (!owned) return fail("not_found");
  const { data, error } = await createAdminClient().rpc("cancel_envelope", {
    p_envelope_id: envelopeId,
    p_user_id: owned.user.id,
  });
  if (error) return fail(error.message.includes("not_cancelable") ? "not_cancelable" : "generic");
  after(() => dispatchEnvelopeEvent(envelopeId, "envelope.canceled"));
  revalidatePath("/[locale]/app", "layout");
  return ok({ released: Number((data as { released?: number } | null)?.released ?? 0) });
}

export async function deleteDraft(envelopeId: string): Promise<ActionResult> {
  const owned = await ownedEnvelope(envelopeId);
  if (!owned) return fail("not_found");
  if (owned.envelope.status !== "draft") return fail("not_draft");
  if (!(await deleteDraftEnvelope(createAdminClient(), owned.user.id, envelopeId)))
    return fail("generic");
  revalidatePath("/[locale]/app", "layout");
  return ok();
}

/** Creates a new draft with copies of the documents and the same signers. */
export async function duplicateEnvelope(envelopeId: string): Promise<ActionResult<{ id: string }>> {
  const owned = await ownedEnvelope(envelopeId);
  if (!owned) return fail("not_found");
  const admin = createAdminClient();
  const { envelope, user } = owned;

  const { data: created, error } = await admin
    .from("envelopes")
    .insert({
      user_id: user.id,
      title: envelope.title,
      message: envelope.message,
      locale: envelope.locale,
      sequential: envelope.sequential,
      reminder_days: envelope.reminder_days,
    })
    .select("id")
    .single();
  if (error || !created) return fail("generic");

  const [{ data: docs }, { data: signers }] = await Promise.all([
    admin.from("documents").select("*").eq("envelope_id", envelopeId).order("order_index"),
    admin
      .from("signers")
      .select("first_name, last_name, email, order_index")
      .eq("envelope_id", envelopeId),
  ]);

  for (const doc of docs ?? []) {
    const newId = crypto.randomUUID();
    const target = paths.original(user.id, created.id, newId);
    const { error: copyError } = await admin.storage
      .from(BUCKETS.originals)
      .copy(doc.original_path, target);
    if (copyError) continue;
    await admin.from("documents").insert({
      id: newId,
      envelope_id: created.id,
      name: doc.name,
      original_path: target,
      original_sha256: doc.original_sha256,
      source_mime_type: doc.source_mime_type,
      mime_type: doc.mime_type,
      page_count: doc.page_count,
      size_bytes: doc.size_bytes,
      order_index: doc.order_index,
    });
  }
  if (signers?.length) {
    await admin.from("signers").insert(signers.map((s) => ({ ...s, envelope_id: created.id })));
  }
  await logEvent(admin, {
    envelopeId: created.id,
    type: "created",
    metadata: { duplicated_from: envelopeId },
  });
  revalidatePath("/[locale]/app", "layout");
  return ok({ id: created.id });
}

const downloadSchema = z.object({
  envelopeId: z.uuid(),
  kind: z.enum(["original", "signed", "evidence", "tsr"]),
  id: z.uuid().optional(),
});

/** Short-lived signed URL for a file of an envelope the caller owns. */
export async function getDownloadUrl(raw: unknown): Promise<ActionResult<{ url: string }>> {
  const parsed = downloadSchema.safeParse(raw);
  if (!parsed.success) return fail("validation");
  const { envelopeId, kind, id } = parsed.data;
  const owned = await ownedEnvelope(envelopeId);
  if (!owned) return fail("not_found");
  const supabase = await createClient();
  const admin = createAdminClient();

  let bucket: string;
  let path: string | null = null;
  let fileName = "document.pdf";
  if (kind === "original") {
    const { data } = await supabase
      .from("documents")
      .select("name, original_path")
      .eq("id", id ?? "")
      .eq("envelope_id", envelopeId)
      .maybeSingle();
    bucket = BUCKETS.originals;
    path = data?.original_path ?? null;
    fileName = safeFileName(data?.name ?? "document.pdf");
  } else {
    const { data } = await supabase
      .from("signed_documents")
      .select("kind, signed_path, tsr_path, tsa_status, documents(name)")
      .eq("id", id ?? "")
      .eq("envelope_id", envelopeId)
      .maybeSingle();
    if (!data) return fail("not_found");
    const base = safeFileName(
      (data.kind === "evidence" ? "evidence" : (data.documents?.name ?? "document")).replace(
        /\.pdf$/i,
        "",
      ),
    );
    if (kind === "tsr") {
      bucket = BUCKETS.tsa;
      path = data.tsa_status === "granted" ? data.tsr_path : null;
      fileName = `${base}.tsr`;
    } else {
      bucket = BUCKETS.signed;
      path = data.signed_path;
      fileName = data.kind === "evidence" ? `${base}.pdf` : `${base}-firmado.pdf`;
    }
  }
  if (!path) return fail("not_found");

  const { data: signed, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, LIMITS.downloadUrlTtlSeconds, { download: fileName });
  if (error || !signed) return fail("generic");

  await logEvent(admin, {
    envelopeId,
    type: "downloaded",
    metadata: { kind, file: fileName, by: "sender" },
  });
  return ok({ url: signed.signedUrl });
}

/**
 * Manual reminder to every pending signer whose turn it is. At most one manual reminder
 * per signer per hour (the cron sends automatic ones every `reminder_days`).
 */
export async function remindPendingSigners(
  envelopeId: string,
): Promise<ActionResult<{ sent: number }>> {
  const owned = await ownedEnvelope(envelopeId);
  if (!owned) return fail("not_found");
  if (owned.envelope.status !== "sent" && owned.envelope.status !== "viewed")
    return fail("not_active");
  const sent = await remindNow(createAdminClient(), envelopeId);
  revalidatePath("/[locale]/app", "layout");
  return ok({ sent });
}

/**
 * In-person signing: the sender hands their device to a signer who is physically present.
 * Revokes that signer's previous links, issues a fresh one and records who hosted the session.
 * Returns the signing URL for the browser to open.
 */
export async function startInPersonSigning(
  envelopeId: string,
  signerId: string,
): Promise<ActionResult<{ url: string }>> {
  const owned = await ownedEnvelope(envelopeId);
  if (!owned || !uuid.safeParse(signerId).success) return fail("not_found");
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, last_name, email")
    .eq("id", owned.user.id)
    .single();
  const hostName = fullName(profile?.first_name, profile?.last_name) || owned.user.email;
  const h = await headers();
  const res = await startInPersonSession(admin, {
    userId: owned.user.id,
    signerId,
    locale: owned.envelope.locale === "en" ? "en" : "es",
    host: `${hostName} <${profile?.email ?? owned.user.email}>`,
    ip: clientIpFrom(h),
    userAgent: h.get("user-agent"),
  });
  return res.ok ? ok({ url: res.url }) : fail(res.error);
}
