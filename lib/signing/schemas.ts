import { z } from "zod";
import { CONSENT_TEXT_VERSION } from "@/lib/config";
import { biometricSchema } from "./biometrics";

export const clientMetaSchema = z.object({
  screenW: z.number().int().min(1).max(20000).optional(),
  screenH: z.number().int().min(1).max(20000).optional(),
  timezone: z.string().max(64).optional(),
  clientTime: z.iso.datetime({ offset: true }).optional(),
  deviceType: z.enum(["mobile", "tablet", "desktop"]).optional(),
});

export const completeSignatureSchema = z.object({
  consent: z.literal(true),
  consentVersion: z.literal(CONSENT_TEXT_VERSION),
  biometrics: biometricSchema,
  signaturePng: z.string().startsWith("data:image/png;base64,").max(1_200_000),
  clientMeta: clientMetaSchema,
});

export type CompleteSignaturePayload = z.input<typeof completeSignatureSchema>;
