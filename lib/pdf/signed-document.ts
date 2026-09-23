import { PDFDocument, type PDFFont, StandardFonts } from "pdf-lib";
import type { EvidenceData, EvidenceDocument } from "./evidence-model";
import { formatLocal, formatUtc, PDF_LABELS } from "./labels";
import { A4, PageWriter } from "./layout";
import { qrPng } from "./qr";
import { COLORS, drawFooter, winAnsi, wrapText } from "./text";

async function embedFonts(pdf: PDFDocument) {
  const [regular, bold, mono] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedFont(StandardFonts.Courier),
  ]);
  return { regular, bold, mono };
}

function setMetadata(pdf: PDFDocument, data: EvidenceData, title: string) {
  const at = new Date(data.envelope.completedAt);
  pdf.setTitle(winAnsi(title), { showInWindowTitleBar: true });
  pdf.setAuthor("DocuFirma");
  pdf.setSubject(winAnsi(`${data.envelope.title} · ${data.envelope.verificationCode}`));
  pdf.setKeywords([data.envelope.verificationCode, "DocuFirma", "eIDAS", "RFC 3161"]);
  pdf.setProducer("DocuFirma (docufirma.es)");
  pdf.setCreator("DocuFirma");
  pdf.setCreationDate(at);
  pdf.setModificationDate(at);
}

function drawSignaturePage(
  pdf: PDFDocument,
  size: [number, number],
  fonts: { regular: PDFFont; bold: PDFFont; mono: PDFFont },
  data: EvidenceData,
  doc: EvidenceDocument,
  signatures: Awaited<ReturnType<PDFDocument["embedPng"]>>[],
) {
  const L = PDF_LABELS[data.locale];
  const writer = new PageWriter(pdf, fonts, size);
  writer.heading(L.signaturePage, 20);
  writer.paragraph(`${data.envelope.title} · ${doc.name}`, { color: COLORS.muted, size: 10 });
  writer.space(4);
  writer.field(L.code, data.envelope.verificationCode, { mono: true, labelWidth: 130 });
  writer.space(12);

  const colGap = 16;
  const cols = writer.width > 400 ? 2 : 1;
  const blockW = (writer.width - colGap * (cols - 1)) / cols;
  const blockH = 168;
  data.signers.forEach((s, i) => {
    const col = i % cols;
    if (col === 0) writer.ensure(blockH + 12);
    const x = writer.margin + col * (blockW + colGap);
    const top = writer.y;
    const page = writer.page;
    page.drawRectangle({
      x,
      y: top - blockH,
      width: blockW,
      height: blockH,
      borderColor: COLORS.border,
      borderWidth: 0.8,
      color: COLORS.soft,
    });
    const img = signatures[i]!;
    const scale = Math.min((blockW - 24) / img.width, 70 / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x: x + 12, y: top - 12 - h - (70 - h) / 2, width: w, height: h });
    page.drawLine({
      start: { x: x + 12, y: top - 88 },
      end: { x: x + blockW - 12, y: top - 88 },
      thickness: 0.6,
      color: COLORS.muted,
    });
    const lines: [string, PDFFont, number, typeof COLORS.ink][] = [
      [`${s.firstName} ${s.lastName}`, fonts.bold, 10, COLORS.ink],
      [s.email, fonts.regular, 8.5, COLORS.muted],
      [`${L.signedAt}: ${formatUtc(s.signedAt)}`, fonts.regular, 8, COLORS.ink],
      [
        formatLocal(s.signedAt, data.locale, s.timezone ?? "Europe/Madrid"),
        fonts.regular,
        8,
        COLORS.muted,
      ],
      [`${L.signerId}: ${s.id}`, fonts.mono, 6.5, COLORS.muted],
    ];
    let y = top - 102;
    for (const [text, font, size, color] of lines) {
      const [first] = wrapText(text, font, size, blockW - 24);
      page.drawText(first ?? "", { x: x + 12, y, size, font, color });
      y -= size + 5;
    }
    if (col === cols - 1 || i === data.signers.length - 1) writer.y = top - blockH - 12;
  });
  return writer;
}

async function drawEvidenceSummary(
  pdf: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont; mono: PDFFont },
  data: EvidenceData,
) {
  const L = PDF_LABELS[data.locale];
  const writer = new PageWriter(pdf, fonts, A4);
  writer.heading(L.evidenceSummary, 18);
  writer.subheading(L.envelope);
  writer.field(L.title, data.envelope.title);
  writer.field(L.code, data.envelope.verificationCode, { mono: true });
  writer.field(
    L.sender,
    [data.sender.name, data.sender.company, data.sender.email].filter(Boolean).join(" · "),
  );
  writer.field(L.sent, formatUtc(data.envelope.sentAt));
  writer.field(L.completed, formatUtc(data.envelope.completedAt));

  writer.subheading(L.documents);
  for (const d of data.documents) {
    writer.field(d.name, `${d.pageCount} ${L.pages}`);
    writer.field(L.originalHash, d.originalSha256, { mono: true, indent: 12, labelWidth: 138 });
  }

  writer.subheading(L.signers);
  for (const s of data.signers) {
    writer.paragraph(`${s.firstName} ${s.lastName} <${s.email}>`, { font: fonts.bold, size: 9.5 });
    writer.field(L.signedAt, formatUtc(s.signedAt), { indent: 12, labelWidth: 138 });
    writer.field(
      L.ip,
      [s.ip, [s.geo.city, s.geo.region, s.geo.country].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(" · ") || "—",
      {
        indent: 12,
        labelWidth: 138,
      },
    );
    writer.field(
      L.pointer,
      `${s.pointerType ?? "—"} · ${L.pressure}: ${s.pressureSupported ? L.yes : L.no}`,
      { indent: 12, labelWidth: 138 },
    );
    writer.field(L.biometricHash, s.biometricSha256, { mono: true, indent: 12, labelWidth: 138 });
    writer.space(4);
  }

  writer.subheading(L.legalTitle);
  writer.paragraph(L.legal, { size: 8.5, color: COLORS.muted });
  writer.space(6);
  writer.paragraph(L.tsaNote, { size: 8.5, color: COLORS.muted });

  const qr = await pdf.embedPng(await qrPng(data.verifyUrl));
  writer.ensure(110);
  writer.space(8);
  const top = writer.y;
  writer.page.drawImage(qr, { x: writer.margin, y: top - 90, width: 90, height: 90 });
  writer.page.drawText(winAnsi(L.scan), {
    x: writer.margin + 104,
    y: top - 30,
    size: 10,
    font: fonts.bold,
    color: COLORS.ink,
  });
  writer.page.drawText(winAnsi(data.verifyUrl), {
    x: writer.margin + 104,
    y: top - 46,
    size: 8.5,
    font: fonts.mono,
    color: COLORS.primary,
  });
  writer.y = top - 100;
}

/**
 * Builds the signed PDF for one document (spec §9.1): original pages untouched, a signature page
 * with every signer's block, an evidence summary with QR, a verification footer on every page and
 * PDF metadata. Output is deterministic for the same inputs.
 */
export async function generateSignedPdf(
  original: Uint8Array,
  data: EvidenceData,
  doc: EvidenceDocument,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original, { updateMetadata: false });
  const fonts = await embedFonts(pdf);
  const signatures = await Promise.all(data.signers.map((s) => pdf.embedPng(s.signatureImage)));

  const last = pdf.getPage(pdf.getPageCount() - 1);
  const { width, height } = last.getSize();
  const rotated = [90, 270].includes(((last.getRotation().angle % 360) + 360) % 360);
  const size: [number, number] =
    width > 200 && height > 200 && !rotated && width < height ? [width, height] : A4;

  drawSignaturePage(pdf, size, fonts, data, doc, signatures);
  await drawEvidenceSummary(pdf, fonts, data);

  const footer = PDF_LABELS[data.locale].footer(data.envelope.verificationCode, data.host);
  for (const page of pdf.getPages()) drawFooter(page, footer, fonts.regular);

  setMetadata(pdf, data, `${data.envelope.title} — ${doc.name}`);
  return pdf.save({ useObjectStreams: false });
}

export { embedFonts, setMetadata };
