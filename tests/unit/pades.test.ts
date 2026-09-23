import { PDFDocument } from "pdf-lib";
import { addDocTimeStamp, readDocTimeStamp } from "@/lib/pdf/pades";
import { buildTimestampRequest, extractTimeStampToken, tokenImprint } from "@/lib/tsa/rfc3161";
import { createTestTimestampResponse } from "@/lib/tsa/test-tsa";
import { makePdf } from "./helpers/pdf";

const provider = async (digest: Buffer) =>
  extractTimeStampToken(await createTestTimestampResponse(buildTimestampRequest(digest).der));

describe("PAdES document timestamp", () => {
  it("embeds an RFC 3161 token covering the ByteRange", async () => {
    const stamped = await addDocTimeStamp(await makePdf(2), provider);
    const pdf = await PDFDocument.load(stamped);
    expect(pdf.getPageCount()).toBe(2);
    const embedded = readDocTimeStamp(stamped);
    expect(embedded).not.toBeNull();
    const [a, b, c, d] = embedded!.byteRange;
    expect(a).toBe(0);
    expect(c! + d!).toBe(stamped.length);
    expect(b! < c!).toBe(true);
    const info = tokenImprint(embedded!.token);
    expect(info.hashAlg).toBe("sha256");
    expect(info.messageImprint).toBe(embedded!.digest.toString("hex"));
    const text = Buffer.from(stamped).toString("latin1");
    expect(text).toContain("/SubFilter /ETSI.RFC3161");
    expect(text).toContain("/Type /DocTimeStamp");
  });

  it("detects any byte changed after stamping", async () => {
    const stamped = Buffer.from(await addDocTimeStamp(await makePdf(1), provider));
    const embedded = readDocTimeStamp(stamped)!;
    stamped[10] = stamped[10] === 0x41 ? 0x42 : 0x41;
    const after = readDocTimeStamp(stamped)!;
    expect(after.digest.equals(embedded.digest)).toBe(false);
    expect(tokenImprint(after.token).messageImprint).not.toBe(after.digest.toString("hex"));
  });
});
