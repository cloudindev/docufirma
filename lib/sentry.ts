import type { ErrorEvent } from "@sentry/nextjs";

/** Removes anything that could identify signers or leak tokens before an event leaves the app. */
export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) {
      for (const h of Object.keys(event.request.headers)) {
        if (/authorization|cookie|stripe-signature|x-forwarded-for|x-real-ip/i.test(h))
          delete event.request.headers[h];
      }
    }
    // Signing links carry the bearer token in the path.
    if (event.request.url)
      event.request.url = event.request.url.replace(/\/sign\/[A-Za-z0-9_-]{20,}/, "/sign/[token]");
  }
  if (event.user) event.user = { id: event.user.id };
  return event;
}

export const sentryDsn = () => process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
