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
