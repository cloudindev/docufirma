/**
 * Auth cookie hardening (spec §13): Secure in production, HttpOnly (the browser never needs to read
 * the session — uploads use signed tokens and all data access goes through the server), SameSite=Lax.
 */
export const authCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};
