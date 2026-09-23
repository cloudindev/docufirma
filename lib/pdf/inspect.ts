import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream } from "pdf-lib";

export type PdfInspection =
  | { ok: true; pageCount: number; doc: PDFDocument }
  | {
      ok: false;
      reason:
        "not_pdf" | "encrypted" | "javascript" | "xfa" | "corrupted" | "empty" | "too_many_pages";
    };

const DANGEROUS_KEYS = ["JavaScript", "JS", "Launch", "RichMedia"];
export const MAX_PAGES = 500;

function dictHasDangerousKey(dict: PDFDict): "javascript" | "xfa" | null {
  for (const key of dict.keys()) {
    const name = key.decodeText();
    if (DANGEROUS_KEYS.includes(name)) return "javascript";
    if (name === "XFA") return "xfa";
    if (name === "S") {
      const value = dict.get(key);
      if (value instanceof PDFName && ["JavaScript", "Launch"].includes(value.decodeText()))
        return "javascript";
    }
  }
  return null;
}

/**
 * Validates an uploaded PDF: real PDF header, parseable, not encrypted, no embedded JavaScript,
 * launch actions or XFA forms (spec §13). Walks every indirect object (including those inside
 * object streams, which pdf-lib expands) instead of trusting a regex over the raw bytes.
 */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  if (bytes.length < 8) return { ok: false, reason: "empty" };
  const header = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  if (!header.includes("%PDF-")) return { ok: false, reason: "not_pdf" };

  const raw = Buffer.from(bytes).toString("latin1");
  if (/\/Encrypt\s/.test(raw)) return { ok: false, reason: "encrypted" };

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  } catch (error) {
    if (String(error).toLowerCase().includes("encrypt")) return { ok: false, reason: "encrypted" };
    return { ok: false, reason: "corrupted" };
  }
  if (doc.isEncrypted) return { ok: false, reason: "encrypted" };

  try {
    const danger = scanDocument(doc);
    if (danger) return { ok: false, reason: danger };
    const pageCount = doc.getPageCount();
    if (pageCount === 0) return { ok: false, reason: "empty" };
    if (pageCount > MAX_PAGES) return { ok: false, reason: "too_many_pages" };
    return { ok: true, pageCount, doc };
  } catch {
    return { ok: false, reason: "corrupted" };
  }
}

function scanDocument(doc: PDFDocument): "javascript" | "xfa" | null {
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict =
      obj instanceof PDFDict
        ? obj
        : obj instanceof PDFStream || obj instanceof PDFRawStream
          ? obj.dict
          : null;
    if (!dict) continue;
    const found = dictHasDangerousKey(dict);
    if (found) return found;
  }
  // Catalog-level names tree / AcroForm XFA / inline OpenAction.
  const acroForm = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  if (acroForm?.get(PDFName.of("XFA"))) return "xfa";
  const names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  if (names?.get(PDFName.of("JavaScript"))) return "javascript";
  const openAction = doc.catalog.get(PDFName.of("OpenAction"));
  if (openAction instanceof PDFDict) return dictHasDangerousKey(openAction);
  return null;
}

/** Sniffs the real file type from magic bytes (never trust the browser-provided MIME type). */
export function sniffMime(
  bytes: Uint8Array,
): "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | "docx" | null {
  const b = Buffer.from(bytes.subarray(0, 16));
  if (Buffer.from(bytes.subarray(0, 1024)).toString("latin1").includes("%PDF-"))
    return "application/pdf";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.subarray(0, 4).toString("latin1") === "RIFF" &&
    b.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return "docx"; // ZIP container; validated by the converter
  return null;
}
