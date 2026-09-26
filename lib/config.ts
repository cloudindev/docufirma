/**
 * Business constants. Prices shown in the UI come from `credit_packs` (DB) and Stripe;
 * these values are defaults for seeding and for copy that must render without a DB round-trip.
 */
export const PLAN = {
  slug: "pro",
  monthlyPriceCents: 900,
  currency: "eur",
  monthlyCredits: 10,
} as const;

export const DEFAULT_PACKS = [
  { slug: "pack-25", credits: 25, priceCents: 1500 },
  { slug: "pack-100", credits: 100, priceCents: 4900 },
  { slug: "pack-500", credits: 500, priceCents: 19900 },
] as const;

/** SMS packs for signer verification codes (1 code sent = 1 SMS). Mirrors the migration seed. */
export const DEFAULT_SMS_PACKS = [
  { slug: "sms-100", credits: 100, priceCents: 900 },
  { slug: "sms-500", credits: 500, priceCents: 3900 },
  { slug: "sms-1000", credits: 1000, priceCents: 6900 },
] as const;

export const LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxDocumentsPerEnvelope: 10,
  maxSignersPerEnvelope: 10,
  defaultExpiryDays: 30,
  maxExpiryDays: 120,
  defaultReminderDays: 3,
  maxReminders: 3,
  lowCreditsThreshold: 2,
  signerUrlTtlSeconds: 60 * 60,
  downloadUrlTtlSeconds: 60 * 5,
  emailDownloadUrlTtlSeconds: 60 * 60 * 24 * 7,
} as const;

export const ACCEPTED_UPLOAD_TYPES = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
} as const;

/** Version of the signer consent text. Bump when the wording in messages/*.json changes. */
export const CONSENT_TEXT_VERSION = "2026-09-v1";

export const TSA_POLICY_OID_MENSATEK = "1.3.6.1.4.1.5734.3.18.1";

export const SUPPORT_EMAIL = "soporte@docufirma.es";
