import sharp from "sharp";
import type { EvidenceData } from "@/lib/pdf/evidence-model";

export async function signaturePng() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="140"><path d="M20 100 C 60 20, 90 20, 110 90 S 170 130, 200 60 S 280 30, 380 90" stroke="#0B1B3F" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
}

export async function sampleEvidence(locale: "es" | "en" = "es"): Promise<EvidenceData> {
  const sig = await signaturePng();
  const signer = (i: number, first: string, last: string) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    firstName: first,
    lastName: last,
    email: `${first.toLowerCase()}@example.com`,
    orderIndex: i,
    signedAt: "2026-09-23T10:15:30Z",
    signatureImage: sig,
    ip: "203.0.113.7",
    geo: { country: "ES", region: "MD", city: "Madrid" },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    deviceType: "mobile",
    screen: { w: 390, h: 844 },
    timezone: "Europe/Madrid",
    pointerType: "touch",
    pressureSupported: false,
    strokeCount: 3,
    pointsCount: 214,
    durationMs: 2350,
    biometricSha256: "b".repeat(64),
    consentVersion: "2026-09-v1",
    consentAcceptedAt: "2026-09-23T10:15:29Z",
    // The second signer signs in person with SMS verification, the first one remotely.
    delivery: i === 1 ? ("in_person" as const) : ("email" as const),
    inPersonHost: i === 1 ? "Ana Martín <ana@example.com>" : null,
    otpPhoneMasked: i === 1 ? "+34 ••• ••• 456" : null,
    otpVerifiedAt: i === 1 ? "2026-09-23T10:14:02Z" : null,
  });
  return {
    locale,
    host: "docufirma.es",
    verifyUrl: "https://docufirma.es/es/verificar?code=DF-TE5T-C0DE",
    envelope: {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Contrato de servicios — Martín & Gómez",
      verificationCode: "DF-TE5T-C0DE",
      createdAt: "2026-09-23T09:00:00Z",
      sentAt: "2026-09-23T09:05:00Z",
      completedAt: "2026-09-23T10:20:00Z",
      sequential: false,
    },
    sender: { name: "Sara Martín", email: "sara@example.com", company: "Martín Asesores" },
    documents: [
      {
        id: "d1",
        name: "contrato.pdf",
        pageCount: 3,
        originalSha256: "a".repeat(64),
        signedSha256: "c".repeat(64),
      },
    ],
    signers: [signer(0, "Lucía", "Gómez Ñúñez"), signer(1, "Łukasz", "Wiśniewski")],
    events: [
      {
        type: "sent",
        createdAt: "2026-09-23T09:05:00Z",
        signerName: null,
        documentName: null,
        ip: null,
      },
      {
        type: "opened",
        createdAt: "2026-09-23T10:10:00Z",
        signerName: "Lucía Gómez",
        documentName: null,
        ip: "203.0.113.7",
      },
      {
        type: "signed",
        createdAt: "2026-09-23T10:15:30Z",
        signerName: "Lucía Gómez",
        documentName: null,
        ip: "203.0.113.7",
      },
    ],
  };
}
