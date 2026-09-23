import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { appUrl } from "@/lib/env-public";
import { inter } from "@/lib/fonts";
import { routing } from "@/lib/i18n/routing";
import { resolveLocale } from "@/lib/i18n/server";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: hasLocale(routing.locales, locale) ? locale : "es",
    namespace: "metadata",
  });
  return {
    metadataBase: new URL(appUrl()),
    title: { default: t("title"), template: `%s · DocuFirma` },
    description: t("description"),
    applicationName: "DocuFirma",
    openGraph: {
      siteName: "DocuFirma",
      type: "website",
      locale: locale === "en" ? "en_GB" : "es_ES",
    },
    twitter: { card: "summary_large_image" },
    icons: { icon: "/icon.svg" },
  };
}

export const viewport: Viewport = {
  themeColor: "#1F4FE0",
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = await resolveLocale(params);

  return (
    <html lang={locale} className={inter.variable}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster />
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
