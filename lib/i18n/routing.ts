import { defineRouting } from "next-intl/routing";

export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/**
 * Localized pathnames. Folder names in `app/[locale]` are English;
 * next-intl rewrites the public URL per locale (see docs/DECISIONS.md D-006).
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
  localeCookie: { name: "NEXT_LOCALE", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" },
  pathnames: {
    "/": "/",
    "/pricing": { es: "/precios", en: "/pricing" },
    "/how-it-works": { es: "/como-funciona", en: "/how-it-works" },
    "/verify": { es: "/verificar", en: "/verify" },
    "/legal/[slug]": "/legal/[slug]",
    "/login": { es: "/iniciar-sesion", en: "/login" },
    "/register": { es: "/registro", en: "/register" },
    "/forgot-password": { es: "/recuperar-contrasena", en: "/forgot-password" },
    "/reset-password": { es: "/restablecer-contrasena", en: "/reset-password" },
    "/app": "/app",
    "/app/onboarding": "/app/onboarding",
    "/app/send": "/app/send",
    "/app/send/[id]": "/app/send/[id]",
    "/app/envelopes": "/app/envelopes",
    "/app/envelopes/[id]": "/app/envelopes/[id]",
    "/app/contacts": "/app/contacts",
    "/app/billing": "/app/billing",
    "/app/settings": "/app/settings",
    "/sign/[token]": "/sign/[token]",
  },
});

export type AppPathname = keyof typeof routing.pathnames;
