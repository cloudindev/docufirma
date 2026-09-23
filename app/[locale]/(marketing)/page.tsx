import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  FaqSection,
  FeaturesSection,
  FinalCta,
  Hero,
  HowItWorksSection,
  LegalSection,
  PricingSection,
} from "@/components/marketing/sections";
import { PLAN } from "@/lib/config";
import { appUrl } from "@/lib/env-public";
import { resolveLocale } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    ...pageMetadata({ href: "/", locale, description: t("description") }),
    title: { absolute: t("title") },
  };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "metadata" });
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "DocuFirma",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: appUrl(`/${locale}`),
    description: t("description"),
    inLanguage: locale,
    offers: {
      "@type": "Offer",
      price: (PLAN.monthlyPriceCents / 100).toFixed(2),
      priceCurrency: "EUR",
      category: "subscription",
    },
    publisher: { "@type": "Organization", name: "DocuFirma", url: appUrl() },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify output is safe here: no user input; "<" escaped to avoid </script> injection.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Hero locale={locale} />
      <HowItWorksSection locale={locale} />
      <FeaturesSection locale={locale} />
      <LegalSection locale={locale} />
      <PricingSection locale={locale} />
      <FaqSection locale={locale} />
      <FinalCta locale={locale} />
    </>
  );
}
