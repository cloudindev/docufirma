import { z } from "zod";

/**
 * Validation messages are translation keys under the `validation` namespace
 * (messages/*.json). Forms translate them with `t(error.message)`.
 */
export const V = {
  required: "validation.required",
  email: "validation.email",
  tooLong: "validation.tooLong",
  passwordMin: "validation.passwordMin",
  passwordWeak: "validation.passwordWeak",
  passwordMismatch: "validation.passwordMismatch",
  acceptTerms: "validation.acceptTerms",
  invalid: "validation.invalid",
} as const;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, V.required)
  .max(254, V.tooLong)
  .email(V.email);

export const personNameSchema = (max: number) =>
  z.string().trim().min(1, V.required).max(max, V.tooLong);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, V.tooLong)
    .optional()
    .transform((v) => (v ? v : undefined));

export const passwordSchema = z
  .string()
  .min(8, V.passwordMin)
  .max(72, V.tooLong)
  .regex(/[A-Za-z]/, V.passwordWeak)
  .regex(/[0-9]/, V.passwordWeak);

export const localeSchema = z.enum(["es", "en"]);
