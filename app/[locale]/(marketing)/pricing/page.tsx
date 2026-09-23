import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FaqSection, FinalCta, PricingSection } from "@/components/marketing/sections";
import { resolveLocale } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/pricing">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "marketing.pricingPage" });
  return pageMetadata({
    href: "/pricing",
    locale,
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function PricingPage({ params }: PageProps<"/[locale]/pricing">) {
  const locale = await resolveLocale(params);
  return (
    <>
      <div className="bg-gradient-to-b from-bg-soft to-bg">
        <PricingSection locale={locale} headingAs="h1" />
      </div>
      <FaqSection locale={locale} />
      <FinalCta locale={locale} />
    </>
  );
}
