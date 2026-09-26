import { PDFDocument } from "pdf-lib";
import { generateEvidencePdf } from "@/lib/pdf/evidence";
import { inspectPdf } from "@/lib/pdf/inspect";
import { generateSignedPdf } from "@/lib/pdf/signed-document";
import { winAnsi, wrapText } from "@/lib/pdf/text";
import { sha256Hex } from "@/lib/signing/tokens";
import { sampleEvidence } from "./helpers/evidence";
import { makePdf } from "./helpers/pdf";
import { pdfText } from "./helpers/pdf-text";

describe("signed PDF", () => {
  it("appends signature + summary pages, keeps the originals and sets metadata", async () => {
    const original = await makePdf(3);
    const data = await sampleEvidence();
    const signed = await generateSignedPdf(original, data, data.documents[0]!);
    const pdf = await PDFDocument.load(signed);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(5); // 3 original + signature page + summary
    expect(pdf.getAuthor()).toBe("DocuFirma");
    expect(pdf.getKeywords()).toContain("DF-TE5T-C0DE");
    expect(pdf.getTitle()).toContain("contrato.pdf");
    expect((await inspectPdf(signed)).ok).toBe(true);
    const pages = await pdfText(signed);
    expect(pages.every((text) => text.includes("DF-TE5T-C0DE"))).toBe(true); // footer on every page
    expect(pages[3]).toContain("Página de firmas");
    expect(pages[3]).toContain("Lucía Gómez Ñúñez");
    expect(pages[3]).toContain("Lukasz Wisniewski");
  });

  it("is deterministic for identical inputs", async () => {
    const original = await makePdf(2);
    const data = await sampleEvidence();
    const a = await generateSignedPdf(original, data, data.documents[0]!);
    const b = await generateSignedPdf(original, data, data.documents[0]!);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });

  it("handles names outside WinAnsi without crashing", async () => {
    expect(winAnsi("Łukasz Wiśniewski 😀")).toBe("Lukasz Wisniewski ?");
    expect(winAnsi("Gómez Ñúñez ¿€?")).toBe("Gómez Ñúñez ¿€?");
  });

  it("wraps long hashes", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont("Courier");
    const lines = wrapText("f".repeat(64), font, 9, 150);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("f".repeat(64));
  });
});

describe("evidence certificate", () => {
  it.each(["es", "en"] as const)("renders in %s", async (locale) => {
    const bytes = await generateEvidencePdf(await sampleEvidence(locale));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(pdf.getTitle()).toContain(
      locale === "es" ? "Certificado de evidencias" : "Evidence certificate",
    );
    expect((await inspectPdf(bytes)).ok).toBe(true);
  });

  it("records how each signer was identified", async () => {
    const text = (await pdfText(await generateEvidencePdf(await sampleEvidence("es")))).join("\n");
    expect(text).toContain("A distancia (enlace personal por email)");
    expect(text).toContain("Presencial, ante Ana Martín <ana@example.com>");
    expect(text).toContain("Código confirmado en +34 ••• ••• 456");
    expect(text).toContain("No utilizada");
  });
});
