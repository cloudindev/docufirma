import { createHash, randomBytes, randomInt } from "node:crypto";

/** 256-bit random token, URL-safe. Only its SHA-256 is ever stored. */
export function generateSignerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Signer tokens are exactly 43 base64url chars (32 bytes). */
export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

// No 0/O/1/I to avoid transcription mistakes when typed from paper.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Human-friendly verification code, e.g. DF-7K3Q-9X2M (~40 bits). Uniqueness is enforced by the DB. */
export function generateVerificationCode(): string {
  const pick = () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `DF-${block()}-${block()}`;
}

export function sha256Hex(data: Uint8Array | Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}
