import { createHash } from "node:crypto";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
} from "pdf-lib";

/**
 * PAdES document timestamp (ETSI EN 319 142, SubFilter ETSI.RFC3161): an invisible signature field
 * whose /Contents holds an RFC 3161 TimeStampToken over the PDF's /ByteRange. PDF readers (Adobe)
 * then show "document timestamped by <TSA>". Opt-in with PADES_DOC_TIMESTAMP=true (one extra TSA
 * stamp per document; the detached .tsr over the whole file is still produced for verification).
 */
const CONTENTS_BYTES = 12_288; // room for the token incl. TSA certificate chain
const PLACEHOLDER = 9_999_999_999;

export type TokenProvider = (digest: Buffer) => Promise<Buffer>; // returns the DER TimeStampToken (ContentInfo)

export async function addDocTimeStamp(
  pdfBytes: Uint8Array,
  getToken: TokenProvider,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const ctx = pdf.context;

  const sig = ctx.obj({
    Type: "DocTimeStamp",
    Filter: "Adobe.PPKLite",
    SubFilter: "ETSI.RFC3161",
    ByteRange: [0, PLACEHOLDER, PLACEHOLDER, PLACEHOLDER],
  }) as PDFDict;
  sig.set(PDFName.of("Contents"), PDFHexString.of("0".repeat(CONTENTS_BYTES * 2)));
  const sigRef = ctx.register(sig);

  const page = pdf.getPage(0);
  const widget = ctx.obj({
    Type: "Annot",
    Subtype: "Widget",
    FT: "Sig",
    Rect: [0, 0, 0, 0],
    F: 132, // hidden + locked
    P: page.ref,
  }) as PDFDict;
  widget.set(PDFName.of("T"), PDFString.of("DocuFirma DocTimeStamp"));
  widget.set(PDFName.of("V"), sigRef);
  const widgetRef = ctx.register(widget);

  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (annots) annots.push(widgetRef);
  else page.node.set(PDFName.of("Annots"), ctx.obj([widgetRef]));

  let acroForm = pdf.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  if (!acroForm) {
    acroForm = ctx.obj({ Fields: [] }) as PDFDict;
    pdf.catalog.set(PDFName.of("AcroForm"), ctx.register(acroForm));
  }
  const fields = acroForm.lookupMaybe(PDFName.of("Fields"), PDFArray);
  if (fields) fields.push(widgetRef);
  else acroForm.set(PDFName.of("Fields"), ctx.obj([widgetRef]));
  acroForm.set(PDFName.of("SigFlags"), PDFNumber.of(3));

  const saved = Buffer.from(await pdf.save({ useObjectStreams: false }));
  const text = saved.toString("latin1");

  // Locate the /Contents placeholder of *our* signature dictionary.
  const placeholder = `<${"0".repeat(CONTENTS_BYTES * 2)}>`;
  const start = text.indexOf(placeholder);
  if (start < 0 || text.indexOf(placeholder, start + 1) >= 0)
    throw new Error("DocTimeStamp placeholder not found or ambiguous");
  const end = start + placeholder.length;
  const byteRange = [0, start, end, saved.length - end];

  const brRegex = new RegExp(
    `/ByteRange\\s*\\[\\s*0\\s+${PLACEHOLDER}\\s+${PLACEHOLDER}\\s+${PLACEHOLDER}\\s*\\]`,
  );
  const match = brRegex.exec(text);
  if (!match) throw new Error("ByteRange placeholder not found");
  const replacement = `/ByteRange [${byteRange.join(" ")}]`.padEnd(match[0].length, " ");
  if (replacement.length !== match[0].length)
    throw new Error("ByteRange does not fit its placeholder");
  saved.write(replacement, match.index, "latin1");

  const digest = createHash("sha256")
    .update(saved.subarray(0, start))
    .update(saved.subarray(end))
    .digest();
  const token = await getToken(digest);
  const hex = token.toString("hex");
  if (hex.length > CONTENTS_BYTES * 2)
    throw new Error(`TimeStampToken too large (${token.length} bytes)`);
  saved.write(`<${hex.padEnd(CONTENTS_BYTES * 2, "0")}>`, start, "latin1");
  return new Uint8Array(saved);
}

/** Reads back the embedded token and the digest it must cover (used by tests and diagnostics). */
export function readDocTimeStamp(
  pdfBytes: Uint8Array,
): { token: Buffer; digest: Buffer; byteRange: number[] } | null {
  const buf = Buffer.from(pdfBytes);
  const text = buf.toString("latin1");
  const m =
    /\/SubFilter\s*\/ETSI\.RFC3161[\s\S]*?\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]|\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\][\s\S]*?\/SubFilter\s*\/ETSI\.RFC3161/.exec(
      text,
    );
  if (!m) return null;
  const nums = (m[1] ? m.slice(1, 5) : m.slice(5, 9)).map(Number);
  const [a, b, c, d] = nums as [number, number, number, number];
  const contentsHex = text.slice(a + b + 1, c - 1).replace(/0+$/, "");
  const token = Buffer.from(contentsHex.length % 2 ? `${contentsHex}0` : contentsHex, "hex");
  const digest = createHash("sha256")
    .update(buf.subarray(a, a + b))
    .update(buf.subarray(c, c + d))
    .digest();
  return { token, digest, byteRange: nums };
}
