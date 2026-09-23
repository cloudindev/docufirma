import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildTimestampRequest,
  parseTimestampRequest,
  parseTimestampResponse,
  verifyTimestampResponse,
} from "@/lib/tsa/rfc3161";
import { createTestTimestampResponse, testTsaCertificatesPem } from "@/lib/tsa/test-tsa";

const data = Buffer.from("%PDF-1.7 signed document bytes");
const hash = createHash("sha256").update(data).digest();

function hasOpenssl() {
  try {
    execFileSync("openssl", ["version"]);
    return true;
  } catch {
    return false;
  }
}

describe("RFC 3161 TimeStampReq", () => {
  it("encodes sha256 imprint, nonce and certReq", () => {
    const { der, nonce } = buildTimestampRequest(hash);
    const parsed = parseTimestampRequest(der);
    expect(parsed.hashAlg).toBe("sha256");
    expect(parsed.messageImprint).toBe(hash.toString("hex"));
    expect(parsed.certReq).toBe(true);
    expect(parsed.nonce?.replace(/^0+/, "")).toBe(nonce.replace(/^0+/, ""));
  });

  it("supports sha384 / sha512 and rejects wrong lengths", () => {
    const h512 = createHash("sha512").update(data).digest();
    expect(parseTimestampRequest(buildTimestampRequest(h512, "sha512").der).hashAlg).toBe("sha512");
    expect(() => buildTimestampRequest(hash, "sha384")).toThrow();
  });

  it.runIf(hasOpenssl())("is readable by OpenSSL", () => {
    const dir = mkdtempSync(join(tmpdir(), "tsq-"));
    writeFileSync(join(dir, "req.tsq"), buildTimestampRequest(hash).der);
    const out = execFileSync("openssl", [
      "ts",
      "-query",
      "-in",
      join(dir, "req.tsq"),
      "-text",
    ]).toString();
    expect(out).toContain("sha256");
    expect(out.replace(/[\s:-]/g, "").toLowerCase()).toContain(hash.toString("hex").slice(0, 16));
    expect(out).toContain("Certificate required: yes");
  });
});

describe("RFC 3161 TimeStampResp", () => {
  const { tsa, ca } = testTsaCertificatesPem();

  it("parses and verifies a granted response", async () => {
    const { der: tsq } = buildTimestampRequest(hash);
    const genTime = new Date();
    genTime.setMilliseconds(0);
    const tsr = await createTestTimestampResponse(tsq, { genTime });
    const parsed = parseTimestampResponse(tsr);
    expect(parsed.granted).toBe(true);
    expect(parsed.genTime?.toISOString()).toBe(genTime.toISOString());
    expect(parsed.messageImprint).toBe(hash.toString("hex"));
    expect(parsed.serialNumber).toMatch(/^[0-9a-f]+$/);
    expect(parsed.signerCommonName).toBe("DocuFirma Test TSA");
    const result = await verifyTimestampResponse(tsr, tsq, hash, { trustedCertsPem: [ca] });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("detects a different document hash", async () => {
    const { der: tsq } = buildTimestampRequest(hash);
    const tsr = await createTestTimestampResponse(tsq);
    const other = createHash("sha256").update("tampered").digest();
    const result = await verifyTimestampResponse(tsr, tsq, other);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("messageImprint");
  });

  it("detects a nonce mismatch (replayed response)", async () => {
    const first = buildTimestampRequest(hash);
    const second = buildTimestampRequest(hash);
    const tsr = await createTestTimestampResponse(first.der);
    const result = await verifyTimestampResponse(tsr, second.der, hash);
    expect(result.errors).toContain("nonce mismatch");
  });

  it("rejects a response whose signature was tampered with", async () => {
    const { der: tsq } = buildTimestampRequest(hash);
    const tsr = Buffer.from(await createTestTimestampResponse(tsq));
    tsr[tsr.length - 5] ^= 0xff; // flips a byte of the RSA signature
    const result = await verifyTimestampResponse(tsr, tsq, hash);
    expect(result.valid).toBe(false);
  });

  it("fails chain validation when the token predates the TSA certificate", async () => {
    const { der: tsq } = buildTimestampRequest(hash);
    const tsr = await createTestTimestampResponse(tsq, {
      genTime: new Date("2000-01-01T00:00:00Z"),
    });
    const result = await verifyTimestampResponse(tsr, tsq, hash, { trustedCertsPem: [ca] });
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toMatch(/not yet valid|expired/);
  });

  it("reports rejection status", async () => {
    const { der: tsq } = buildTimestampRequest(hash);
    const tsr = await createTestTimestampResponse(tsq, { reject: true });
    expect(parseTimestampResponse(tsr).statusText).toBe("rejection");
    expect((await verifyTimestampResponse(tsr, tsq, hash)).valid).toBe(false);
  });

  it.runIf(hasOpenssl())("verifies with openssl ts -verify (interoperability)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tsr-"));
    const { der: tsq } = buildTimestampRequest(hash);
    writeFileSync(join(dir, "doc.pdf"), data);
    writeFileSync(join(dir, "doc.tsr"), await createTestTimestampResponse(tsq));
    writeFileSync(join(dir, "ca.pem"), ca);
    writeFileSync(join(dir, "tsa.pem"), tsa);
    const out = execFileSync(
      "openssl",
      [
        "ts",
        "-verify",
        "-in",
        join(dir, "doc.tsr"),
        "-data",
        join(dir, "doc.pdf"),
        "-CAfile",
        join(dir, "ca.pem"),
        "-untrusted",
        join(dir, "tsa.pem"),
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    ).toString();
    expect(out).toContain("Verification: OK");
  });
});
