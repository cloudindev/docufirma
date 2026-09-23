/** Generates the sample PDFs / images used by the e2e tests (tests/fixtures). */
import { writeFileSync } from "node:fs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import sharp from "sharp";

async function contract(title: string, pages: number) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const lorem =
    "Las partes acuerdan las condiciones que se detallan a continuación. El presente documento se firma electrónicamente con plena validez conforme al Reglamento (UE) 910/2014.";
  for (let p = 0; p < pages; p++) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText(title, { x: 56, y: 770, size: 20, font: bold, color: rgb(0.04, 0.1, 0.25) });
    page.drawText(`Página ${p + 1} de ${pages}`, {
      x: 56,
      y: 745,
      size: 10,
      font,
      color: rgb(0.36, 0.42, 0.55),
    });
    for (let i = 0; i < 26; i++) {
      page.drawText(`${i + 1}. ${lorem.slice(0, 88)}`, { x: 56, y: 700 - i * 22, size: 10, font });
    }
  }
  pdf.setTitle(title);
  pdf.setCreationDate(new Date("2026-01-01T00:00:00Z"));
  pdf.setModificationDate(new Date("2026-01-01T00:00:00Z"));
  return pdf.save();
}

async function main() {
  writeFileSync(
    "tests/fixtures/contrato.pdf",
    await contract("Contrato de prestación de servicios", 3),
  );
  writeFileSync("tests/fixtures/anexo.pdf", await contract("Anexo I - Tarifas", 1));
  writeFileSync(
    "tests/fixtures/dni.png",
    await sharp({ create: { width: 900, height: 560, channels: 3, background: "#EAF0FF" } })
      .png()
      .toBuffer(),
  );
  console.log("fixtures written");
}

void main();
