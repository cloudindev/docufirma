import { z } from "zod";
import { LIMITS } from "@/lib/config";

/** Public API payloads (snake_case). Validated again against the app's own schemas. */

const signerIn = z
  .object({
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(120),
    email: z.email().max(254),
    phone: z.string().trim().max(32).optional(),
    require_sms_otp: z.boolean().optional(),
    delivery: z.enum(["email", "in_person"]).optional(),
  })
  .strict();

/** Inline documents: base64 content up to 3 MB (larger files use the upload flow). */
export const INLINE_MAX_BYTES = 3 * 1024 * 1024;
export const documentIn = z
  .object({
    name: z.string().trim().min(1).max(255),
    content_base64: z
      .string()
      .min(4)
      .max(Math.ceil((INLINE_MAX_BYTES * 4) / 3) + 8),
  })
  .strict();

const settingsShape = {
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().max(2000),
  locale: z.enum(["es", "en"]),
  sequential: z.boolean(),
  expiry_days: z.number().int().min(1).max(LIMITS.maxExpiryDays),
  reminder_days: z.number().int().min(0).max(30),
  signers: z.array(signerIn).max(LIMITS.maxSignersPerEnvelope),
};

export const createEnvelopeIn = z
  .object({
    ...settingsShape,
    message: settingsShape.message.optional(),
    locale: settingsShape.locale.optional(),
    sequential: settingsShape.sequential.optional(),
    expiry_days: settingsShape.expiry_days.optional(),
    reminder_days: settingsShape.reminder_days.optional(),
    signers: settingsShape.signers.optional(),
    documents: z.array(documentIn).max(LIMITS.maxDocumentsPerEnvelope).optional(),
    send: z.boolean().optional(),
  })
  .strict();
export type CreateEnvelopeIn = z.infer<typeof createEnvelopeIn>;

export const updateEnvelopeIn = z.object(settingsShape).partial().strict();
export type UpdateEnvelopeIn = z.infer<typeof updateEnvelopeIn>;

export const uploadIn = z
  .object({
    name: z.string().trim().min(1).max(255),
    size_bytes: z.number().int().positive().max(LIMITS.maxFileBytes),
  })
  .strict();

export const completeUploadIn = z.object({ name: z.string().trim().min(1).max(255) }).strict();

export const listQuery = z.object({
  status: z
    .enum(["draft", "sent", "viewed", "completed", "declined", "expired", "canceled"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  starting_after: z.uuid().optional(),
});
