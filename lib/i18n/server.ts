import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { type Locale, routing } from "./routing";

/**
 * Resolve and validate the `[locale]` segment of a page/layout, enabling static rendering.
 * Usage: `const locale = await usePageLocale(props.params)`.
 */
export async function resolveLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return locale;
}
