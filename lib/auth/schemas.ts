import { z } from "zod";
import {
  emailSchema,
  localeSchema,
  passwordSchema,
  personNameSchema,
  V,
} from "@/lib/validation/common";

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, V.required),
});

export const magicLinkSchema = z.object({ email: emailSchema });

export const registerSchema = z.object({
  firstName: personNameSchema(80),
  lastName: personNameSchema(120),
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { error: V.acceptTerms }),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: V.passwordMismatch, path: ["confirm"] });

export const onboardingSchema = z.object({
  firstName: personNameSchema(80),
  lastName: personNameSchema(120),
  companyName: z.string().trim().max(160, V.tooLong).optional(),
  locale: localeSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** Only same-origin relative paths are accepted as post-login destinations. */
export function safeNextPath(next: string | null | undefined, fallback: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\"))
    return fallback;
  return next;
}
