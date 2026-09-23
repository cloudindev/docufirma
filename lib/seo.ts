import type { Metadata } from "next";
import { appUrl } from "@/lib/env-public";
import { getPathname } from "@/lib/i18n/navigation";
import { type Locale, locales } from "@/lib/i18n/routing";

type Href = Parameters<typeof getPathname>[0]["href"];

/** Canonical URL + hreflang alternates for a localized route. */
export function localizedAlternates(href: Href, locale: Locale): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const l of locales)
    languages[l === "es" ? "es-ES" : "en"] = appUrl(getPathname({ href, locale: l }));
  languages["x-default"] = appUrl(getPathname({ href, locale: "es" }));
  return { canonical: appUrl(getPathname({ href, locale })), languages };
}

export function pageMetadata({
  href,
  locale,
  title,
  description,
}: {
  href: Href;
  locale: Locale;
  title?: string;
  description?: string;
}): Metadata {
  return {
    title,
    description,
    alternates: localizedAlternates(href, locale),
    openGraph: {
      title: title ?? "DocuFirma",
      description,
      url: appUrl(getPathname({ href, locale })),
    },
  };
}
