import "server-only";
import { z } from "zod";

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const serverSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_PRO_MONTHLY: optional,
  RESEND_API_KEY: optional,
  EMAIL_FROM: z.string().default("DocuFirma <no-reply@mail.docufirma.es>"),
  MENSATEK_TSA_ENDPOINT: z.url().default("https://api.mensatek.com/tsaMENSATEK"),
  MENSATEK_TSA_USER: optional,
  MENSATEK_TSA_PASSWORD: optional,
  EVIDENCE_ENCRYPTION_KEY: optional,
  EVIDENCE_ENCRYPTION_KEYS_OLD: optional,
  CRON_SECRET: optional,
  UPSTASH_REDIS_REST_URL: optional,
  UPSTASH_REDIS_REST_TOKEN: optional,
  DOCX_CONVERTER_URL: optional,
  SENTRY_DSN: optional,
  TRIAL_CREDITS: z.coerce.number().int().min(0).default(3),
  BIOMETRIC_RETENTION_YEARS: z.coerce.number().int().min(1).default(5),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/**
 * Parsed server environment. Lazy so that `next build` does not require every
 * secret; the first request that needs them fails loudly with a clear message.
 */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export { appUrl } from "./env-public";
