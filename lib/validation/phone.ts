/**
 * Phone numbers are stored in E.164 ("+34600123456"). Spanish users usually type national
 * numbers, so a bare 9-digit number starting with 6, 7, 8 or 9 is assumed to be Spanish.
 * Shared by the browser (wizard) and the server.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let v = input.trim().replace(/[\s().-]/g, "");
  if (!v) return null;
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  if (/^[6789]\d{8}$/.test(v)) v = `+34${v}`;
  return /^\+[1-9]\d{7,14}$/.test(v) ? v : null;
}

/** "+34600123456" → "+34 ••• ••• 456" (same format as the database's _mask_phone). */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return `${phone.slice(0, 3)} ••• ••• ${phone.slice(-3)}`;
}
