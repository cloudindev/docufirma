/**
 * Content-Security-Policy builder (spec §13).
 *  - Sensitive, dynamic areas (/app/**, /sign/**): strict nonce-based policy with 'strict-dynamic'.
 *  - Static public pages: same policy but scripts allowed via 'unsafe-inline' (no per-request nonce
 *    is possible for statically generated HTML; these pages hold no user data).
 * Inline style attributes are required by framer-motion / Radix, hence style-src 'unsafe-inline'.
 */
function origins() {
  const list = new Set<string>();
  const add = (url?: string) => {
    if (!url) return;
    try {
      list.add(new URL(url).origin);
    } catch {
      // ignore malformed values
    }
  };
  add(process.env.NEXT_PUBLIC_SUPABASE_URL);
  add(
    process.env.NEXT_PUBLIC_SENTRY_DSN
      ? `https://${new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).host}`
      : undefined,
  );
  return [...list];
}

export function buildCsp({
  nonce,
  dev = process.env.NODE_ENV !== "production",
}: { nonce?: string; dev?: boolean } = {}) {
  const extra = origins();
  const script = nonce
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`
    : `'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`;
  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": script,
    "style-src": "'self' 'unsafe-inline'",
    "img-src": ["'self'", "data:", "blob:", ...extra].join(" "),
    "font-src": "'self' data:",
    "connect-src": ["'self'", ...extra, ...(dev ? ["ws:", "wss:"] : [])].join(" "),
    "worker-src": "'self' blob:",
    "frame-src": "'none'",
    "frame-ancestors": "'none'",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "manifest-src": "'self'",
  };
  let value = Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`)
    .join("; ");
  if (!dev) value += "; upgrade-insecure-requests";
  return value;
}

export function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
