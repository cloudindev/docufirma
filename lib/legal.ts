export const LEGAL_SLUGS = [
  "legal-notice",
  "privacy",
  "cookies",
  "terms",
  "signature-policy",
] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];
export const LEGAL_UPDATED_AT = "2026-09-26";

export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}
