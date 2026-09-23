import { createTranslator } from "next-intl";
import en from "../messages/en.json";
import es from "../messages/es.json";

export type EmailLocale = "es" | "en";

export function emailTranslator(locale: EmailLocale) {
  return createTranslator({ locale, messages: locale === "en" ? en : es, namespace: "emails" });
}

export type EmailT = ReturnType<typeof emailTranslator>;

export function formatEmailDate(iso: string | Date, locale: EmailLocale, withTime = false) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", timeZoneName: "short" } : {}),
    timeZone: "Europe/Madrid",
  }).format(new Date(iso));
}
