import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "@/lib/i18n/routing";

const intl = createIntlMiddleware(routing);

export function proxy(request: NextRequest) {
  return intl(request);
}

export const config = {
  // Skip API routes, auth callbacks, Next internals, and files with an extension.
  matcher: ["/((?!api|auth|_next|_vercel|monitoring|.*\\..*).*)"],
};
