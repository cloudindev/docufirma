import { createHash, randomBytes, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import { OID_TST_INFO, pemToCertificate } from "./rfc3161";

/**
 * Local RFC 3161 Time Stamping Authority for tests and sandboxed development
 * (TSA_PROVIDER=test). Signs with the throwaway key in tests/fixtures/tsa.
 * Its tokens are structurally identical to a real TSA's but have NO legal value.
 */
export const TEST_TSA_POLICY_OID = "1.3.6.1.4.1.99999.1.1";

const toAB = (b: Uint8Array): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

function fixture(name: string) {
  const dir = process.env.TEST_TSA_DIR ?? join(process.cwd(), "tests", "fixtures", "tsa");
  return readFileSync(join(dir, name), "utf8");
}

let keyPromise: Promise<CryptoKey> | null = null;
function privateKey() {
  keyPromise ??= (async () => {
    const pem = fixture("test-tsa.pkcs8.pem");
    const der = Buffer.from(
      pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, ""),
      "base64",
    );
    return webcrypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    ) as Promise<CryptoKey>;
  })();
  return keyPromise;
}

export function testTsaCertificatesPem() {
  return { tsa: fixture("test-tsa.pem"), ca: fixture("test-ca.pem") };
}

/** Produces a DER TimeStampResp for a DER TimeStampReq. */
export async function createTestTimestampResponse(
  tsqDer: Uint8Array,
  opts: { genTime?: Date; reject?: boolean } = {},
): Promise<Buffer> {
  const req = new pkijs.TimeStampReq({ schema: asn1js.fromBER(toAB(tsqDer)).result });
  if (opts.reject) {
    const resp = new pkijs.TimeStampResp({
      status: new pkijs.PKIStatusInfo({ status: pkijs.PKIStatus.rejection }),
    });
    return Buffer.from(resp.toSchema().toBER(false));
  }
  const certPem = testTsaCertificatesPem().tsa;
  const cert = pemToCertificate(certPem);
  const certDer = Buffer.from(
    certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, ""),
    "base64",
  );

  const serial = randomBytes(10);
  serial[0] &= 0x7f;
  const tstInfo = new pkijs.TSTInfo({
    version: 1,
    policy: req.reqPolicy ?? TEST_TSA_POLICY_OID,
    messageImprint: req.messageImprint,
    serialNumber: new asn1js.Integer({ valueHex: toAB(serial) }),
    genTime: opts.genTime ?? new Date(),
    accuracy: new pkijs.Accuracy({ seconds: 1 }),
    nonce: req.nonce,
  });
  const tstDer = tstInfo.toSchema().toBER(false);

  // Signed attributes required by RFC 3161 / RFC 5816: contentType, messageDigest, signingCertificateV2.
  // SigningCertificateV2 ::= SEQUENCE { certs SEQUENCE OF ESSCertIDv2 }
  // ESSCertIDv2 ::= SEQUENCE { hashAlgorithm DEFAULT sha256 (omitted), certHash OCTET STRING }
  const certHash = new asn1js.OctetString({
    valueHex: toAB(createHash("sha256").update(certDer).digest()),
  });
  const signingCertificateV2 = new asn1js.Sequence({
    value: [new asn1js.Sequence({ value: [new asn1js.Sequence({ value: [certHash] })] })],
  });
  const signedAttrs = new pkijs.SignedAndUnsignedAttributes({
    type: 0,
    attributes: [
      new pkijs.Attribute({
        type: "1.2.840.113549.1.9.3",
        values: [new asn1js.ObjectIdentifier({ value: OID_TST_INFO })],
      }),
      new pkijs.Attribute({
        type: "1.2.840.113549.1.9.5",
        values: [new asn1js.UTCTime({ valueDate: new Date() })],
      }),
      new pkijs.Attribute({
        type: "1.2.840.113549.1.9.4",
        values: [
          new asn1js.OctetString({
            valueHex: toAB(createHash("sha256").update(Buffer.from(tstDer)).digest()),
          }),
        ],
      }),
      new pkijs.Attribute({ type: "1.2.840.113549.1.9.16.2.47", values: [signingCertificateV2] }),
    ],
  });

  const signed = new pkijs.SignedData({
    version: 3,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: OID_TST_INFO,
      eContent: new asn1js.OctetString({ valueHex: tstDer }),
    }),
    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({
          issuer: cert.issuer,
          serialNumber: cert.serialNumber,
        }),
        signedAttrs,
      }),
    ],
    certificates: [cert],
  });
  await signed.sign(await privateKey(), 0, "SHA-256");

  const resp = new pkijs.TimeStampResp({
    status: new pkijs.PKIStatusInfo({ status: pkijs.PKIStatus.granted }),
    timeStampToken: new pkijs.ContentInfo({
      contentType: pkijs.ContentInfo.SIGNED_DATA,
      content: signed.toSchema(true),
    }),
  });
  return Buffer.from(resp.toSchema().toBER(false));
}
