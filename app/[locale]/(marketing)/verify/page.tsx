import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SectionHeading } from "@/components/marketing/section-heading";
import { VerifyForm } from "@/components/verify/verify-form";
import { resolveLocale } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/verify">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "verify" });
  return pageMetadata({
    href: "/verify",
    locale,
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function VerifyPage({ params, searchParams }: PageProps<"/[locale]/verify">) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "verify" });
  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code : undefined;
  return (
    <div className="bg-gradient-to-b from-bg-soft to-bg">
      <div className="container-page max-w-3xl space-y-10 py-14 sm:py-20">
        <SectionHeading as="h1" title={t("title")} subtitle={t("subtitle")} />
        <VerifyForm initialCode={code} />
      </div>
    </div>
  );
}
