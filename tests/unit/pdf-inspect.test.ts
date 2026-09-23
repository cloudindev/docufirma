import { PDFDocument } from "pdf-lib";
import { imageToPdf } from "@/lib/pdf/convert";
import { inspectPdf, sniffMime } from "@/lib/pdf/inspect";
import { sha256Hex } from "@/lib/signing/tokens";
import { makePdf, makePdfWithJavaScript, makePdfWithXfa, makePng } from "./helpers/pdf";

describe("inspectPdf", () => {
  it("accepts a normal PDF and counts pages", async () => {
    const res = await inspectPdf(await makePdf(3));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.pageCount).toBe(3);
  });

  it("rejects non-PDF content", async () => {
    expect(await inspectPdf(new TextEncoder().encode("hello world, not a pdf"))).toEqual({
      ok: false,
      reason: "not_pdf",
    });
  });

  it("rejects PDFs with embedded JavaScript", async () => {
    expect(await inspectPdf(await makePdfWithJavaScript())).toMatchObject({
      ok: false,
      reason: "javascript",
    });
  });

  it("rejects XFA forms", async () => {
    expect(await inspectPdf(await makePdfWithXfa())).toMatchObject({ ok: false, reason: "xfa" });
  });

  it("rejects encrypted PDFs", async () => {
    const bytes = Buffer.concat([
      Buffer.from(await makePdf(1)),
      Buffer.from("\ntrailer << /Encrypt 5 0 R >>\n"),
    ]);
    expect(await inspectPdf(bytes)).toMatchObject({ ok: false, reason: "encrypted" });
  });

  it("rejects corrupted PDFs", async () => {
    const res = await inspectPdf(new TextEncoder().encode("%PDF-1.7\n garbage garbage"));
    expect(res.ok).toBe(false);
  });
});

describe("sniffMime", () => {
  it("detects types from magic bytes", async () => {
    expect(sniffMime(await makePdf(1))).toBe("application/pdf");
    expect(sniffMime(await makePng())).toBe("image/png");
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    expect(sniffMime(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe("docx");
    expect(sniffMime(new TextEncoder().encode("plain"))).toBeNull();
  });
});

describe("imageToPdf", () => {
  it("wraps an image in a single A4 page", async () => {
    const pdf = await PDFDocument.load(await imageToPdf(await makePng(1200, 800)));
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeGreaterThan(height); // landscape image → landscape page
  });

  it("keeps transparency as PNG", async () => {
    const bytes = await imageToPdf(await makePng(400, 600, true));
    expect((await inspectPdf(bytes)).ok).toBe(true);
  });
});

describe("hashing", () => {
  it("is deterministic for identical bytes", async () => {
    const a = await makePdf(2);
    expect(sha256Hex(a)).toBe(sha256Hex(Buffer.from(a)));
    expect(sha256Hex(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
