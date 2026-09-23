import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 36;

/** Converts a PNG/JPEG/WebP image into a single-page A4 PDF (orientation follows the image). */
export async function imageToPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const image = sharp(Buffer.from(bytes), { limitInputPixels: 80_000_000 }).rotate();
  const meta = await image.metadata();
  const hasAlpha = Boolean(meta.hasAlpha);
  // Keep PNG for images with transparency / line art, JPEG (q90) otherwise to keep PDFs small.
  const normalized = hasAlpha
    ? await image
        .resize({ width: 2480, height: 3508, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer()
    : await image
        .resize({ width: 2480, height: 3508, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();

  const pdf = await PDFDocument.create();
  const embedded = hasAlpha ? await pdf.embedPng(normalized) : await pdf.embedJpg(normalized);
  const landscape = embedded.width > embedded.height;
  const pageSize: [number, number] = landscape ? [A4.height, A4.width] : [A4.width, A4.height];
  const page = pdf.addPage(pageSize);
  const maxW = pageSize[0] - MARGIN * 2;
  const maxH = pageSize[1] - MARGIN * 2;
  const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1.5);
  const w = embedded.width * scale;
  const h = embedded.height * scale;
  page.drawImage(embedded, {
    x: (pageSize[0] - w) / 2,
    y: (pageSize[1] - h) / 2,
    width: w,
    height: h,
  });
  pdf.setProducer("DocuFirma");
  pdf.setCreator("DocuFirma");
  return pdf.save();
}

/**
 * DOCX → PDF through a Gotenberg instance (LibreOffice route). Returns null when no
 * converter is configured (the UI then only accepts PDF and images).
 */
export async function docxToPdf(bytes: Uint8Array, fileName: string): Promise<Uint8Array | null> {
  const base = process.env.DOCX_CONVERTER_URL;
  if (!base) return null;
  const form = new FormData();
  form.append(
    "files",
    new Blob([new Uint8Array(bytes)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    fileName.toLowerCase().endsWith(".docx") ? fileName : `${fileName}.docx`,
  );
  const res = await fetch(`${base.replace(/\/$/, "")}/forms/libreoffice/convert`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`docx converter responded ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export function isDocxConversionEnabled() {
  return Boolean(process.env.DOCX_CONVERTER_URL);
}
