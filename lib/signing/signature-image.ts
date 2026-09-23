import "server-only";
import sharp from "sharp";
import { sha256Hex } from "./tokens";

const MAX_BYTES = 800 * 1024;

/**
 * Validates and normalises the transparent PNG drawn by the signer: real PNG, bounded size,
 * trimmed to the ink, max 1200×480 px, metadata stripped.
 */
export async function normaliseSignaturePng(
  dataUrl: string,
): Promise<{ png: Buffer; sha256: string; width: number; height: number } | null> {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const raw = Buffer.from(match[1], "base64");
  if (raw.length === 0 || raw.length > MAX_BYTES) return null;
  if (!raw.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return null;
  try {
    const trimmed = await sharp(raw, { limitInputPixels: 20_000_000 })
      .ensureAlpha()
      .trim({ threshold: 1 })
      .toBuffer();
    const png = await sharp(trimmed)
      .resize({ width: 1200, height: 480, fit: "inside", withoutEnlargement: true })
      .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const meta = await sharp(png).metadata();
    if (!meta.width || !meta.height || meta.width < 24 || meta.height < 12) return null;
    return { png, sha256: sha256Hex(png), width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}
