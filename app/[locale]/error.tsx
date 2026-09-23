"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <main className="container-page flex min-h-[60vh] flex-col items-center justify-center gap-4 py-24 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="size-7" strokeWidth={1.75} aria-hidden />
      </span>
      <h1 className="text-2xl">{t("generic")}</h1>
      {error.digest ? <p className="text-xs text-ink-muted">Ref. {error.digest}</p> : null}
      <Button onClick={reset}>{t("retry")}</Button>
    </main>
  );
}
