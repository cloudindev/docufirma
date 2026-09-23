"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";

/** Last-resort error boundary (replaces the root layout when it crashes). */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="es">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100dvh",
          margin: 0,
          color: "#0B1B3F",
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1>Algo ha ido mal · Something went wrong</h1>
          <p style={{ color: "#5B6B8C" }}>{error.digest ? `Ref. ${error.digest}` : null}</p>
          <button
            onClick={reset}
            style={{
              background: "#1F4FE0",
              color: "#fff",
              border: 0,
              borderRadius: 999,
              padding: "12px 20px",
              cursor: "pointer",
            }}
          >
            Reintentar · Retry
          </button>
        </div>
      </body>
    </html>
  );
}
