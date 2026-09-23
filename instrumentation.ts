import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  const { scrubEvent } = await import("./lib/sentry");
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0.1,
    // Collect no personal data (signers' documents and biometrics must never reach Sentry).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    // console.error in server code (e.g. 3rd consecutive TSA failure) becomes a Sentry event.
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
    beforeSend: scrubEvent,
  });
}

export const onRequestError = Sentry.captureRequestError;
