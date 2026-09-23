/**
 * Storage layout (all buckets private). Paths are relative to the bucket.
 *   originals/{user}/{envelope}/{document}.pdf
 *   signed/{user}/{envelope}/{document}-signed.pdf · signed/{user}/{envelope}/evidence.pdf
 *   evidence/{user}/{envelope}/{signer}/biometrics.bin · …/signature.png
 *   tsa/{user}/{envelope}/{signed_document}.tsq|.tsr
 *   branding/{user}/logo.png
 */
export const BUCKETS = {
  originals: "originals",
  signed: "signed",
  evidence: "evidence",
  tsa: "tsa",
  branding: "branding",
} as const;

export const paths = {
  upload: (userId: string, envelopeId: string, uploadId: string) =>
    `${userId}/${envelopeId}/uploads/${uploadId}`,
  original: (userId: string, envelopeId: string, documentId: string) =>
    `${userId}/${envelopeId}/${documentId}.pdf`,
  signed: (userId: string, envelopeId: string, documentId: string) =>
    `${userId}/${envelopeId}/${documentId}-signed.pdf`,
  evidencePdf: (userId: string, envelopeId: string) => `${userId}/${envelopeId}/evidence.pdf`,
  biometrics: (userId: string, envelopeId: string, signerId: string) =>
    `${userId}/${envelopeId}/${signerId}/biometrics.bin`,
  signatureImage: (userId: string, envelopeId: string, signerId: string) =>
    `${userId}/${envelopeId}/${signerId}/signature.png`,
  tsq: (userId: string, envelopeId: string, artifactId: string) =>
    `${userId}/${envelopeId}/${artifactId}.tsq`,
  tsr: (userId: string, envelopeId: string, artifactId: string) =>
    `${userId}/${envelopeId}/${artifactId}.tsr`,
  logo: (userId: string) => `${userId}/logo.png`,
};

/** Owner folder of a path (first segment). Used to keep files grouped even after account deletion. */
export function ownerOf(path: string) {
  return path.split("/")[0] ?? "";
}

export function safeFileName(name: string, fallback = "document") {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return cleaned || fallback;
}
