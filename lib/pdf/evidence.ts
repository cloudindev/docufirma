import { PDFDocument } from "pdf-lib";
import type { EvidenceData } from "./evidence-model";
import { EVENT_LABELS, formatLocal, formatUtc, PDF_LABELS } from "./labels";
import { A4, PageWriter } from "./layout";
import { qrPng } from "./qr";
import { embedFonts, setMetadata } from "./signed-document";
import { COLORS, drawFooter, winAnsi } from "./text";

/** Full evidence certificate (spec §9.1.3), delivered as a separate PDF and timestamped on its own. */
export async function generateEvidencePdf(data: EvidenceData): Promise<Uint8Array> {
  const L = PDF_LABELS[data.locale];
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  const qr = await pdf.embedPng(await qrPng(data.verifyUrl));
  const w = new PageWriter(pdf, fonts, A4);

  // Header block
  w.page.drawText("DocuFirma", {
    x: w.margin,
    y: w.y - 14,
    size: 14,
    font: fonts.bold,
    color: COLORS.primary,
  });
  w.page.drawImage(qr, { x: w.margin + w.width - 80, y: w.y - 80, width: 80, height: 80 });
  w.y -= 34;
  w.heading(L.evidenceTitle, 22);
  w.paragraph(data.envelope.title, { size: 11, color: COLORS.muted });
  w.space(4);
  w.field(L.code, data.envelope.verificationCode, { mono: true });
  w.field(L.verifyAt, data.verifyUrl, { mono: true });
  w.space(8);

  w.subheading(L.envelope);
  w.field(L.title, data.envelope.title);
  w.field("ID", data.envelope.id, { mono: true });
  w.field(L.sender, [data.sender.name, data.sender.company].filter(Boolean).join(" · "));
  if (data.sender.email) w.field(L.email, data.sender.email);
  w.field(
    L.created,
    `${formatUtc(data.envelope.createdAt)} · ${formatLocal(data.envelope.createdAt, data.locale)}`,
  );
  w.field(
    L.sent,
    `${formatUtc(data.envelope.sentAt)} · ${formatLocal(data.envelope.sentAt, data.locale)}`,
  );
  w.field(
    L.completed,
    `${formatUtc(data.envelope.completedAt)} · ${formatLocal(data.envelope.completedAt, data.locale)}`,
  );

  w.subheading(L.documents);
  data.documents.forEach((d, i) => {
    w.paragraph(`${i + 1}. ${d.name} (${d.pageCount} ${L.pages})`, { font: fonts.bold });
    w.field(L.originalHash, d.originalSha256, { mono: true, indent: 12, labelWidth: 138 });
    if (d.signedSha256)
      w.field(L.signedHash, d.signedSha256, { mono: true, indent: 12, labelWidth: 138 });
    w.space(3);
  });

  w.subheading(L.signers);
  for (const s of data.signers) {
    w.ensure(170);
    const img = await pdf.embedPng(s.signatureImage);
    w.paragraph(`${s.orderIndex + 1}. ${s.firstName} ${s.lastName}`, {
      font: fonts.bold,
      size: 10.5,
    });
    w.space(2);
    w.image(img, 180, 60, w.margin + 12);
    w.space(Math.min(60, img.height * Math.min(180 / img.width, 60 / img.height, 1)) + 6);
    const f = (label: string, value: string, mono = false) =>
      w.field(label, value, { mono, indent: 12, labelWidth: 138 });
    f(L.email, s.email);
    f(L.signerId, s.id, true);
    f(
      L.signedAt,
      `${formatUtc(s.signedAt)} · ${formatLocal(s.signedAt, data.locale, s.timezone ?? "Europe/Madrid")}`,
    );
    f(L.ip, s.ip ?? "—", true);
    f(L.location, [s.geo.city, s.geo.region, s.geo.country].filter(Boolean).join(", ") || "—");
    f(L.device, s.deviceType ?? "—");
    f(L.userAgent, s.userAgent ?? "—");
    f(L.screen, s.screen.w && s.screen.h ? `${s.screen.w}×${s.screen.h}` : "—");
    f(L.timezone, s.timezone ?? "—");
    f(L.pointer, s.pointerType ?? "—");
    f(L.pressure, s.pressureSupported ? L.yes : L.no);
    f(L.strokes, `${s.strokeCount} / ${s.pointsCount} / ${(s.durationMs / 1000).toFixed(2)} s`);
    f(L.biometricHash, s.biometricSha256, true);
    f(L.consent, `${s.consentVersion ?? "—"} · ${formatUtc(s.consentAcceptedAt)}`);
    w.space(8);
  }

  w.subheading(L.timeline);
  for (const e of data.events) {
    const label = EVENT_LABELS[data.locale][e.type] ?? e.type;
    const who = [e.signerName, e.documentName].filter(Boolean).join(" · ");
    w.field(
      formatUtc(e.createdAt),
      `${label}${who ? ` — ${who}` : ""}${e.ip ? ` (IP ${e.ip})` : ""}`,
      { labelWidth: 150 },
    );
  }

  w.subheading(L.legalTitle);
  w.paragraph(L.legal, { size: 9, color: COLORS.muted });
  w.space(6);
  w.paragraph(L.tsaNote, { size: 9, color: COLORS.muted });

  const pages = pdf.getPages();
  const footer = PDF_LABELS[data.locale].footer(data.envelope.verificationCode, data.host);
  pages.forEach((page, i) => {
    drawFooter(page, footer, fonts.regular);
    const label = winAnsi(L.page(i + 1, pages.length));
    const width = fonts.regular.widthOfTextAtSize(label, 7);
    page.drawText(label, {
      x: A4[0] - 50 - width,
      y: A4[1] - 30,
      size: 7,
      font: fonts.regular,
      color: COLORS.muted,
    });
  });

  setMetadata(pdf, data, `${L.evidenceTitle} — ${data.envelope.title}`);
  return pdf.save({ useObjectStreams: false });
}
