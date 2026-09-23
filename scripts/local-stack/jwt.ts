import { createHmac, timingSafeEqual } from "node:crypto";

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyJwt<T = Record<string, unknown>>(token: string, secret: string): T | null {
  const [header, body, sig] = token.split(".");
  if (!header || !body || !sig) return null;
  const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest();
  const actual = Buffer.from(sig, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & {
    exp?: number;
  };
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return payload;
}
