import { degrees, type PDFFont, type PDFPage, rgb } from "pdf-lib";

export const COLORS = {
  ink: rgb(0.043, 0.106, 0.247), // #0B1B3F
  muted: rgb(0.357, 0.42, 0.549), // #5B6B8C
  primary: rgb(0.122, 0.31, 0.878), // #1F4FE0
  border: rgb(0.89, 0.91, 0.949), // #E3E8F2
  soft: rgb(0.961, 0.973, 1), // #F5F8FF
  success: rgb(0.071, 0.718, 0.416),
};

/**
 * Standard PDF fonts only encode WinAnsi (covers Spanish/English incl. á é ñ ü ¿ ¡ €).
 * Anything else is transliterated (NFKD without diacritics) or replaced by "?" so that
 * PDF generation never fails on unusual names.
 */
const TRANSLITERATE: Record<string, string> = {
  Ł: "L",
  ł: "l",
  Đ: "D",
  đ: "d",
  Ħ: "H",
  ħ: "h",
  ı: "i",
  Ŀ: "L",
  ŀ: "l",
  Ŋ: "N",
  ŋ: "n",
  Ŧ: "T",
  ŧ: "t",
};

export function winAnsi(text: string): string {
  const allowed = /[\x20-\x7E -ÿ€–—‘’“”•…]/;
  let out = "";
  for (const ch of text.replace(/[\r\n\t]+/g, " ")) {
    if (allowed.test(ch)) {
      out += ch;
      continue;
    }
    const base = TRANSLITERATE[ch] ?? ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    out += base && [...base].every((c) => allowed.test(c)) ? base : "?";
  }
  return out;
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = winAnsi(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const width = (s: string) => font.widthOfTextAtSize(s, size);
  for (const word of words) {
    // Break very long tokens (hashes, URLs) character by character.
    if (width(word) > maxWidth) {
      if (line) {
        lines.push(line);
        line = "";
      }
      let chunk = "";
      for (const ch of word) {
        if (width(chunk + ch) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (width(candidate) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/**
 * Draws a single line of text at the *visual* bottom of the page regardless of /Rotate,
 * horizontally centred. Used for the verification footer on every page.
 */
export function drawFooter(page: PDFPage, text: string, font: PDFFont, size = 6.5, margin = 12) {
  const { width, height } = page.getSize();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const safe = winAnsi(text);
  const textWidth = font.widthOfTextAtSize(safe, size);
  const color = COLORS.muted;
  switch (rotation) {
    case 90:
      page.drawText(safe, {
        x: width - margin,
        y: (height - textWidth) / 2,
        size,
        font,
        color,
        rotate: degrees(90),
      });
      break;
    case 180:
      page.drawText(safe, {
        x: (width + textWidth) / 2,
        y: height - margin,
        size,
        font,
        color,
        rotate: degrees(180),
      });
      break;
    case 270:
      page.drawText(safe, {
        x: margin,
        y: (height + textWidth) / 2,
        size,
        font,
        color,
        rotate: degrees(270),
      });
      break;
    default:
      page.drawText(safe, {
        x: (width - textWidth) / 2,
        y: margin - size / 2 + 2,
        size,
        font,
        color,
      });
  }
}
