import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope for biometric evidence at rest (spec §13).
 * Layout: "DFE1" | keyIdLen(1) | keyId(ascii) | iv(12) | tag(16) | ciphertext
 * The key id is derived from the key (first 16 hex chars of SHA-256), so rotating is just:
 * set a new EVIDENCE_ENCRYPTION_KEY and append the old one to EVIDENCE_ENCRYPTION_KEYS_OLD.
 */
const MAGIC = Buffer.from("DFE1");

type Key = { id: string; key: Buffer };

function parseKey(b64: string): Key {
  const key = Buffer.from(b64.trim(), "base64");
  if (key.length !== 32) throw new Error("Evidence encryption keys must be 32 bytes (base64)");
  return { id: createHash("sha256").update(key).digest("hex").slice(0, 16), key };
}

export function currentKey(): Key {
  const raw = process.env.EVIDENCE_ENCRYPTION_KEY;
  if (!raw) throw new Error("EVIDENCE_ENCRYPTION_KEY is not configured");
  return parseKey(raw);
}

function allKeys(): Key[] {
  const old = (process.env.EVIDENCE_ENCRYPTION_KEYS_OLD ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseKey);
  return [currentKey(), ...old];
}

export function encryptEvidence(plaintext: Buffer): { data: Buffer; keyId: string } {
  const { id, key } = currentKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const idBuf = Buffer.from(id, "ascii");
  return {
    data: Buffer.concat([MAGIC, Buffer.from([idBuf.length]), idBuf, iv, tag, ciphertext]),
    keyId: id,
  };
}

export function decryptEvidence(data: Buffer): Buffer {
  if (!data.subarray(0, 4).equals(MAGIC)) throw new Error("Not a DocuFirma evidence file");
  const idLen = data[4]!;
  const id = data.subarray(5, 5 + idLen).toString("ascii");
  const iv = data.subarray(5 + idLen, 17 + idLen);
  const tag = data.subarray(17 + idLen, 33 + idLen);
  const ciphertext = data.subarray(33 + idLen);
  const key = allKeys().find((k) => k.id === id);
  if (!key) throw new Error(`No evidence key with id ${id}`);
  const decipher = createDecipheriv("aes-256-gcm", key.key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
