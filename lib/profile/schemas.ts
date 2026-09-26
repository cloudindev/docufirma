import { z } from "zod";
import { localeSchema, personNameSchema, V } from "@/lib/validation/common";

export const profileSchema = z.object({
  firstName: personNameSchema(80),
  lastName: personNameSchema(120),
  companyName: z.string().trim().max(160, V.tooLong),
  taxId: z
    .string()
    .trim()
    .toUpperCase()
    .max(32, V.tooLong)
    .regex(/^[A-Z0-9-]*$/, V.invalid),
});

export const preferencesSchema = z.object({
  locale: localeSchema,
  notifyOnView: z.boolean(),
  notifyOnComplete: z.boolean(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;

export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Automatic top-up of signatures or SMS (D-040). */
export const autoRechargeSchema = z.object({
  kind: z.enum(["signatures", "sms"]),
  enabled: z.boolean(),
  threshold: z.coerce.number<number>().int(V.invalid).min(0, V.invalid).max(1000, V.invalid),
  packSlug: z.string().trim().min(1, V.required).max(40),
});
export type AutoRechargeInput = z.infer<typeof autoRechargeSchema>;
