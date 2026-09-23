import type { PdfLocale } from "./labels";

export type EvidenceSigner = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  orderIndex: number;
  signedAt: string;
  signatureImage: Uint8Array; // PNG
  ip: string | null;
  geo: { country: string | null; region: string | null; city: string | null };
  userAgent: string | null;
  deviceType: string | null;
  screen: { w: number | null; h: number | null };
  timezone: string | null;
  pointerType: string | null;
  pressureSupported: boolean;
  strokeCount: number;
  pointsCount: number;
  durationMs: number;
  biometricSha256: string;
  consentVersion: string | null;
  consentAcceptedAt: string | null;
};

export type EvidenceDocument = {
  id: string;
  name: string;
  pageCount: number;
  originalSha256: string;
  signedSha256?: string;
};

export type EvidenceEvent = {
  type: string;
  createdAt: string;
  signerName: string | null;
  documentName: string | null;
  ip: string | null;
};

export type EvidenceData = {
  locale: PdfLocale;
  host: string; // e.g. docufirma.es
  verifyUrl: string;
  envelope: {
    id: string;
    title: string;
    verificationCode: string;
    createdAt: string;
    sentAt: string | null;
    completedAt: string;
    sequential: boolean;
  };
  sender: { name: string; email: string | null; company: string | null };
  documents: EvidenceDocument[];
  signers: EvidenceSigner[];
  events: EvidenceEvent[];
};
