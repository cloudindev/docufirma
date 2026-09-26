import "server-only";
import { randomInt } from "node:crypto";
import { sha256Hex } from "./tokens";

export const OTP_LENGTH = 6;

/** 6-digit code from a CSPRNG. */
export function generateOtp() {
  return randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, "0");
}

/** Codes are only stored hashed, bound to the signing link they were requested from. */
export function hashOtp(tokenHash: string, code: string) {
  return sha256Hex(`${tokenHash}:${code}`);
}

export function otpSmsText(locale: "es" | "en", code: string) {
  return locale === "en"
    ? `DocuFirma: your signing code is ${code}. It expires in 10 minutes. Do not share it.`
    : `DocuFirma: tu codigo de firma es ${code}. Caduca en 10 minutos. No lo compartas.`;
}
