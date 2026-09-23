import { PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";
import sharp from "sharp";

export async function makePdf(pages = 2, text = "Contrato de prueba"): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText(`${text} — página ${i + 1}`, { x: 50, y: 780, size: 14, font });
  }
  pdf.setCreationDate(new Date("2026-01-01T00:00:00Z"));
  pdf.setModificationDate(new Date("2026-01-01T00:00:00Z"));
  return pdf.save();
}

export async function makePdfWithJavaScript(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const action = pdf.context.obj({
    Type: "Action",
    S: "JavaScript",
    JS: PDFString.of("app.alert('x')"),
  });
  pdf.catalog.set(PDFName.of("OpenAction"), pdf.context.register(action));
  return pdf.save();
}

export async function makePdfWithXfa(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const acro = pdf.context.obj({ Fields: [], XFA: PDFString.of("<xdp/>") });
  pdf.catalog.set(PDFName.of("AcroForm"), pdf.context.register(acro));
  return pdf.save();
}

export async function makePng(width = 800, height = 600, alpha = false): Promise<Uint8Array> {
  return sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 31, g: 79, b: 224, alpha: 0.5 } : "#1F4FE0",
    },
  })
    .png()
    .toBuffer();
}
