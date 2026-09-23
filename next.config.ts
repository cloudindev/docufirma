import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import createNextIntlPlugin from "next-intl/plugin";
import { buildCsp } from "./lib/security/csp";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Native / heavy server-only deps stay out of the bundle.
  serverExternalPackages: ["sharp", "pkijs", "asn1js"],
  experimental: {
    serverActions: {
      // Signature submission carries the biometric JSON + PNG; uploads go straight to Storage.
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Baseline CSP for everything except /app and /sign (those get a nonce-based CSP in proxy.ts).
        source: "/((?!(?:es|en)/(?:app|sign)(?:/|$)).*)",
        headers: [{ key: "Content-Security-Policy", value: buildCsp() }],
      },
      {
        // Signer view: never leak the token through the Referer header, never index.
        source: "/:locale/sign/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/:locale/app/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.docufirma.es" }],
        destination: "https://docufirma.es/:path*",
        permanent: true,
      },
    ];
  },
};

const withIntl = withNextIntl(nextConfig);

// Sentry build integration (source maps) only when configured; runtime init lives in instrumentation*.ts.
export default process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
  ? withSentryConfig(withIntl, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      tunnelRoute: "/monitoring",
    })
  : withIntl;
