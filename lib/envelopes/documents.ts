import "server-only";
import { randomUUID } from "node:crypto";
import { docxToPdf, imageToPdf } from "@/lib/pdf/convert";
import { inspectPdf, sniffMime } from "@/lib/pdf/inspect";
import { sha256Hex } from "@/lib/signing/tokens";
import { BUCKETS, paths } from "@/lib/storage/paths";
import type { AdminSupabase } from "@/lib/supabase/admin";

export type ProcessError =
  | "not_found"
  | "unsupported"
  | "too_large"
  | "docx_disabled"
  | "conversion_failed"
  | "not_pdf"
  | "encrypted"
  | "javascript"
  | "xfa"
  | "corrupted"
  | "empty"
  | "too_many_pages";

/**
 * Turns a raw upload (already in Storage under uploads/) into a validated original PDF:
 * sniff the real type, convert images / DOCX, inspect the PDF, hash it and store it.
 */
export async function processUpload(
  admin: AdminSupabase,
  args: {
    userId: string;
    envelopeId: string;
    uploadPath: string;
    fileName: string;
    orderIndex: number;
  },
): Promise<
  | {
      ok: true;
      document: {
        id: string;
        name: string;
        page_count: number;
        size_bytes: number;
        original_sha256: string;
      };
    }
  | { ok: false; error: ProcessError }
> {
  const { data: blob, error } = await admin.storage
    .from(BUCKETS.originals)
    .download(args.uploadPath);
  if (error || !blob) return { ok: false, error: "not_found" };
  const raw = new Uint8Array(await blob.arrayBuffer());
  const cleanup = () => admin.storage.from(BUCKETS.originals).remove([args.uploadPath]);

  try {
    if (raw.byteLength > 25 * 1024 * 1024) return { ok: false, error: "too_large" };
    const kind = sniffMime(raw);
    let pdfBytes: Uint8Array;
    if (kind === "application/pdf") {
      pdfBytes = raw;
    } else if (kind === "image/png" || kind === "image/jpeg" || kind === "image/webp") {
      try {
        pdfBytes = await imageToPdf(raw);
      } catch {
        return { ok: false, error: "conversion_failed" };
      }
    } else if (kind === "docx") {
      try {
        const converted = await docxToPdf(raw, args.fileName);
        if (!converted) return { ok: false, error: "docx_disabled" };
        pdfBytes = converted;
      } catch {
        return { ok: false, error: "conversion_failed" };
      }
    } else {
      return { ok: false, error: "unsupported" };
    }

    const inspection = await inspectPdf(pdfBytes);
    if (!inspection.ok) return { ok: false, error: inspection.reason };

    const id = randomUUID();
    const path = paths.original(args.userId, args.envelopeId, id);
    const { error: upErr } = await admin.storage
      .from(BUCKETS.originals)
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw upErr;

    const name =
      kind === "application/pdf" ? args.fileName : args.fileName.replace(/\.[^.]+$/, "") + ".pdf";
    const row = {
      id,
      envelope_id: args.envelopeId,
      name: name.slice(0, 255),
      original_path: path,
      original_sha256: sha256Hex(pdfBytes),
      source_mime_type:
        kind === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : kind,
      mime_type: "application/pdf",
      page_count: inspection.pageCount,
      size_bytes: pdfBytes.byteLength,
      order_index: args.orderIndex,
    };
    const { error: insErr } = await admin.from("documents").insert(row);
    if (insErr) {
      await admin.storage.from(BUCKETS.originals).remove([path]);
      throw insErr;
    }
    return { ok: true, document: row };
  } finally {
    await cleanup();
  }
}
