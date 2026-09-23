import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { defaultLocale, isLocale, type Locale, routing } from "@/lib/i18n/routing";
import { buildCsp, generateNonce } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/middleware";

const intl = createIntlMiddleware(routing);

function localizedPath(locale: Locale, key: "/login" | "/app") {
  const entry = routing.pathnames[key];
  const path = typeof entry === "string" ? entry : entry[locale];
  return `/${locale}${path}`;
}

const AUTH_ONLY_GUEST = new Set<string>(
  (["/login", "/register", "/forgot-password"] as const).flatMap((key) => {
    const entry = routing.pathnames[key];
    return typeof entry === "string" ? [entry] : Object.values(entry);
  }),
);

export async function proxy(request: NextRequest) {
  const [, maybeLocale, ...rest] = request.nextUrl.pathname.split("/");
  const locale: Locale = isLocale(maybeLocale) ? maybeLocale : defaultLocale;
  const subPath = `/${rest.join("/")}`;
  const isApp = subPath === "/app" || subPath.startsWith("/app/");
  const isSign = subPath.startsWith("/sign/");

  // Strict nonce-based CSP for the dynamic, sensitive areas. Next.js reads the nonce from the
  // request's CSP header and applies it to its own scripts.
  let csp: string | null = null;
  if (isApp || isSign) {
    csp = buildCsp({ nonce: generateNonce() });
    request.headers.set("content-security-policy", csp);
  }

  // The signer view never depends on a sender session: skip auth work entirely.
  // Everything else refreshes the session first, before next-intl snapshots the request headers.
  const session = isSign ? null : await updateSession(request);

  const response = intl(request);
  if (csp) response.headers.set("Content-Security-Policy", csp);
  if (!session) return response;

  // Redirects issued by next-intl (e.g. "/" -> "/es") are returned as-is.
  if (response.headers.get("location")) return session.apply(response);

  if (isApp && !session.userId) {
    const url = request.nextUrl.clone();
    url.pathname = localizedPath(locale, "/login");
    url.search = "";
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return session.apply(NextResponse.redirect(url));
  }

  if (session.userId && AUTH_ONLY_GUEST.has(subPath)) {
    const url = request.nextUrl.clone();
    url.pathname = localizedPath(locale, "/app");
    url.search = "";
    return session.apply(NextResponse.redirect(url));
  }

  return session.apply(response);
}

export const config = {
  // Skip API routes, auth callbacks, Next internals, and files with an extension.
  matcher: ["/((?!api|auth|_next|_vercel|monitoring|.*\\..*).*)"],
};
