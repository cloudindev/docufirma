"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

/**
 * Translates validation messages produced by zod schemas (keys like `validation.required`)
 * and falls back to the raw message for anything else.
 */
export function useTranslateError() {
  const t = useTranslations();
  return useCallback(
    (message?: string) => {
      if (!message) return undefined;
      const key = message as Parameters<typeof t>[0];
      return t.has(key) ? t(key) : message;
    },
    [t],
  );
}
