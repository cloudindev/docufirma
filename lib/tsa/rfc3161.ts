import { randomBytes, webcrypto } from "node:crypto";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

// pkijs uses WebCrypto; make sure it has Node's implementation (independent of globals).
pkijs.setEngine(
  "node",
  new pkijs.CryptoEngine({ name: "node", crypto: webcrypto as unknown as Crypto }),
);

export const HASH_OIDS = {
  sha256: "2.16.840.1.101.3.4.2.1",
  sha384: "2.16.840.1.101.3.4.2.2",
  sha512: "2.16.840.1.101.3.4.2.3",
} as const;
export type HashAlg = keyof typeof HASH_OIDS;
const HASH_LENGTH: Record<HashAlg, number> = { sha256: 32, sha384: 48, sha512: 64 };
const OID_TO_HASH = Object.fromEntries(Object.entries(HASH_OIDS).map(([k, v]) => [v, k])) as Record<
  string,
  HashAlg
>;

export const OID_TST_INFO = "1.2.840.113549.1.9.16.1.4";
const OID_SIGNED_DATA = "1.2.840.113549.1.7.2";

export const PKI_STATUS_TEXT: Record<number, string> = {
  0: "granted",
  1: "grantedWithMods",
  2: "rejection",
  3: "waiting",
  4: "revocationWarning",
  5: "revocationNotification",
};

const toArrayBuffer = (b: Uint8Array): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const hex = (b: ArrayBuffer | Uint8Array) =>
  Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b).toString("hex");

/** Builds a DER-encoded TimeStampReq (RFC 3161 §2.4.1) with certReq=true and a random 64-bit nonce. */
export function buildTimestampRequest(
  hash: Uint8Array,
  alg: HashAlg = "sha256",
  opts: { policyOid?: string } = {},
) {
  if (hash.length !== HASH_LENGTH[alg])
    throw new Error(`Hash length ${hash.length} does not match ${alg}`);
  const nonce = randomBytes(8);
  nonce[0] &= 0x7f; // keep the INTEGER positive
  if (nonce[0] === 0) nonce[0] = 1; // avoid a non-minimal encoding
  const req = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: HASH_OIDS[alg] }),
      hashedMessage: new asn1js.OctetString({ valueHex: toArrayBuffer(hash) }),
    }),
    nonce: new asn1js.Integer({ valueHex: toArrayBuffer(nonce) }),
    certReq: true,
    ...(opts.policyOid ? { reqPolicy: opts.policyOid } : {}),
  });
  return { der: Buffer.from(req.toSchema().toBER(false)), nonce: nonce.toString("hex") };
}

export type ParsedTimestampRequest = {
  hashAlg: HashAlg;
  messageImprint: string;
  nonce: string | null;
  certReq: boolean;
  policyOid: string | null;
};

export function parseTimestampRequest(tsq: Uint8Array): ParsedTimestampRequest {
  const asn1 = asn1js.fromBER(toArrayBuffer(tsq));
  if (asn1.offset === -1) throw new Error("Malformed TimeStampReq");
  const req = new pkijs.TimeStampReq({ schema: asn1.result });
  const alg = OID_TO_HASH[req.messageImprint.hashAlgorithm.algorithmId];
  if (!alg) throw new Error("Unsupported hash algorithm");
  return {
    hashAlg: alg,
    messageImprint: hex(req.messageImprint.hashedMessage.valueBlock.valueHexView),
    nonce: req.nonce ? hex(req.nonce.valueBlock.valueHexView) : null,
    certReq: Boolean(req.certReq),
    policyOid: req.reqPolicy ?? null,
  };
}

export type ParsedTimestampResponse = {
  status: number;
  statusText: string;
  failInfo: string | null;
  granted: boolean;
  genTime: Date | null;
  serialNumber: string | null; // hex
  policyOid: string | null;
  hashAlg: HashAlg | null;
  messageImprint: string | null; // hex
  nonce: string | null; // hex
  tsaName: string | null;
  signerCommonName: string | null;
  certificates: number;
};

function nameToString(rdn: pkijs.RelativeDistinguishedNames | undefined) {
  if (!rdn) return null;
  const labels: Record<string, string> = {
    "2.5.4.3": "CN",
    "2.5.4.10": "O",
    "2.5.4.11": "OU",
    "2.5.4.6": "C",
    "2.5.4.7": "L",
    "2.5.4.5": "SERIALNUMBER",
    "2.5.4.97": "organizationIdentifier",
  };
  return rdn.typesAndValues
    .map((tv) => `${labels[tv.type] ?? tv.type}=${tv.value.valueBlock.value}`)
    .join(", ");
}

function commonName(rdn: pkijs.RelativeDistinguishedNames | undefined) {
  return rdn?.typesAndValues.find((tv) => tv.type === "2.5.4.3")?.value.valueBlock.value ?? null;
}

function decode(tsr: Uint8Array) {
  const asn1 = asn1js.fromBER(toArrayBuffer(tsr));
  if (asn1.offset === -1) throw new Error("Malformed TimeStampResp");
  const resp = new pkijs.TimeStampResp({ schema: asn1.result });
  let signed: pkijs.SignedData | null = null;
  let tst: pkijs.TSTInfo | null = null;
  if (resp.timeStampToken) {
    if (resp.timeStampToken.contentType !== OID_SIGNED_DATA)
      throw new Error("timeStampToken is not SignedData");
    signed = new pkijs.SignedData({ schema: resp.timeStampToken.content });
    if (signed.encapContentInfo.eContentType !== OID_TST_INFO)
      throw new Error("eContent is not TSTInfo");
    const eContent = signed.encapContentInfo.eContent;
    if (!eContent) throw new Error("Missing TSTInfo");
    const tstAsn1 = asn1js.fromBER(eContent.getValue());
    tst = new pkijs.TSTInfo({ schema: tstAsn1.result });
  }
  return { resp, signed, tst };
}

/** Parses a DER TimeStampResp (RFC 3161 §2.4.2). Throws on malformed input. */
export function parseTimestampResponse(tsr: Uint8Array): ParsedTimestampResponse {
  const { resp, signed, tst } = decode(tsr);
  const status = resp.status.status;
  const signerCert = signed?.certificates?.find(
    (c): c is pkijs.Certificate => c instanceof pkijs.Certificate,
  );
  let tsaName: string | null = null;
  if (tst?.tsa && tst.tsa.type === 4)
    tsaName = nameToString(tst.tsa.value as pkijs.RelativeDistinguishedNames);
  return {
    status,
    statusText: PKI_STATUS_TEXT[status] ?? `unknown(${status})`,
    failInfo: resp.status.failInfo ? hex(resp.status.failInfo.valueBlock.valueHexView) : null,
    granted: status === 0 || status === 1,
    genTime: tst?.genTime ?? null,
    serialNumber: tst ? hex(tst.serialNumber.valueBlock.valueHexView) : null,
    policyOid: tst?.policy ?? null,
    hashAlg: tst ? (OID_TO_HASH[tst.messageImprint.hashAlgorithm.algorithmId] ?? null) : null,
    messageImprint: tst ? hex(tst.messageImprint.hashedMessage.valueBlock.valueHexView) : null,
    nonce: tst?.nonce ? hex(tst.nonce.valueBlock.valueHexView) : null,
    tsaName: tsaName ?? nameToString(signerCert?.subject),
    signerCommonName: commonName(signerCert?.subject),
    certificates: signed?.certificates?.length ?? 0,
  };
}

export type VerificationResult = {
  valid: boolean;
  errors: string[];
  parsed: ParsedTimestampResponse | null;
};

/**
 * Verifies a TSR against the request and the hash we asked to be stamped:
 *  1. status granted  2. nonce matches the request  3. messageImprint == our hash (same algorithm)
 *  4. CMS signature valid with the embedded TSA certificate (and chain, if trusted roots are given)
 *  5. the signing certificate has the critical id-kp-timeStamping extended key usage.
 */
export async function verifyTimestampResponse(
  tsr: Uint8Array,
  tsq: Uint8Array,
  originalHash: Uint8Array,
  opts: { trustedCertsPem?: string[] } = {},
): Promise<VerificationResult> {
  const errors: string[] = [];
  let parsed: ParsedTimestampResponse;
  let decoded: ReturnType<typeof decode>;
  try {
    decoded = decode(tsr);
    parsed = parseTimestampResponse(tsr);
  } catch (e) {
    return { valid: false, errors: [`malformed: ${(e as Error).message}`], parsed: null };
  }
  const req = parseTimestampRequest(tsq);

  if (!parsed.granted) errors.push(`status ${parsed.statusText}`);
  if (!decoded.signed || !decoded.tst) {
    errors.push("missing timeStampToken");
    return { valid: false, errors, parsed };
  }
  if (req.nonce && parsed.nonce?.replace(/^0+/, "") !== req.nonce.replace(/^0+/, ""))
    errors.push("nonce mismatch");
  if (parsed.hashAlg !== req.hashAlg) errors.push("hash algorithm mismatch");
  if (parsed.messageImprint !== Buffer.from(originalHash).toString("hex"))
    errors.push("messageImprint does not match the document hash");
  if (req.policyOid && parsed.policyOid !== req.policyOid) errors.push("policy mismatch");

  const signerCert = decoded.signed.certificates?.find(
    (c): c is pkijs.Certificate => c instanceof pkijs.Certificate,
  );
  if (!signerCert) errors.push("TSA certificate not included");
  else {
    const eku = signerCert.extensions?.find((e) => e.extnID === "2.5.29.37");
    const purposes = (eku?.parsedValue as pkijs.ExtKeyUsage | undefined)?.keyPurposes ?? [];
    if (!purposes.includes("1.3.6.1.5.5.7.3.8"))
      errors.push("certificate is not a timestamping certificate");
  }

  try {
    // asn1js may expose a parsed (constructed) view of the eContent OCTET STRING; pkijs' verifier
    // expects the raw primitive bytes, so normalise it before verifying.
    const eContent = decoded.signed.encapContentInfo.eContent;
    if (eContent) {
      decoded.signed.encapContentInfo.eContent = new asn1js.OctetString({
        valueHex: eContent.getValue(),
      });
    }
    // pkijs re-checks a TSTInfo by hashing the *original data*, which we don't hold here (only its
    // hash, already compared against messageImprint above). Verifying it as plain CMS data still
    // checks the messageDigest signed attribute over the TSTInfo bytes, the RSA/ECDSA signature
    // and, optionally, the certificate chain at genTime.
    decoded.signed.encapContentInfo.eContentType = "1.2.840.113549.1.7.1";
    const trustedCerts = (opts.trustedCertsPem ?? []).map(pemToCertificate);
    const result = await decoded.signed.verify({
      signer: 0,
      checkChain: trustedCerts.length > 0,
      trustedCerts,
      extendedMode: true,
      checkDate: parsed.genTime ?? undefined,
    });
    if (!result.signatureVerified)
      errors.push(`signature invalid${result.message ? `: ${result.message}` : ""}`);
  } catch (e) {
    errors.push(
      `signature verification failed: ${(e as { message?: string }).message ?? String(e)}`,
    );
  }
  return { valid: errors.length === 0, errors, parsed };
}

export function pemToCertificate(pem: string): pkijs.Certificate {
  const b64 = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
  const der = Buffer.from(b64, "base64");
  return pkijs.Certificate.fromBER(toArrayBuffer(der));
}
