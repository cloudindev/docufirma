import { z } from "zod";
import { LIMITS } from "@/lib/config";
import { emailSchema, localeSchema, personNameSchema, V } from "@/lib/validation/common";

export const signerSchema = z.object({
  firstName: personNameSchema(80),
  lastName: personNameSchema(120),
  email: emailSchema,
});

export const EXPIRY_OPTIONS = [7, 15, 30, 60, 90] as const;
export const REMINDER_OPTIONS = [0, 1, 2, 3, 5, 7] as const;

export const envelopeSettingsSchema = z.object({
  title: z.string().trim().max(200, V.tooLong),
  message: z.string().trim().max(2000, V.tooLong),
  sequential: z.boolean(),
  locale: localeSchema,
  expiryDays: z.coerce.number().int().min(1).max(LIMITS.maxExpiryDays),
  reminderDays: z.coerce.number().int().min(0).max(30),
  signers: z.array(signerSchema).max(LIMITS.maxSignersPerEnvelope, "send.errors.tooManySigners"),
});

/** Stricter version used right before sending. */
export const sendEnvelopeSchema = envelopeSettingsSchema
  .extend({
    title: z.string().trim().min(1, V.required).max(200, V.tooLong),
    signers: z
      .array(signerSchema)
      .min(1, "send.errors.noSigners")
      .max(LIMITS.maxSignersPerEnvelope, "send.errors.tooManySigners"),
  })
  .superRefine((value, ctx) => {
    const seen = new Map<string, number>();
    value.signers.forEach((s, i) => {
      const key = s.email.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["signers", i, "email"],
          message: "send.errors.duplicateEmail",
        });
      }
      seen.set(key, i);
    });
  });

export type EnvelopeSettings = z.infer<typeof envelopeSettingsSchema>;
export type EnvelopeSettingsInput = z.input<typeof envelopeSettingsSchema>;

export const uploadRequestSchema = z.object({
  envelopeId: z.uuid().optional(),
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(LIMITS.maxFileBytes),
  type: z.string().max(200),
});

export const finalizeUploadSchema = z.object({
  envelopeId: z.uuid(),
  uploadPath: z.string().min(1).max(500),
  fileName: z.string().trim().min(1).max(255),
});

export function titleFromFileName(name: string) {
  return name
    .replace(/\.(pdf|docx|png|jpe?g|webp)$/i, "")
    .replace(/[_]+/g, " ")
    .trim()
    .slice(0, 200);
}
