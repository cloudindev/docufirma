import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/billing">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "app.billing" });
  return { title: t("metaTitle") };
}

/** Full billing page is built in Phase 7 (Stripe). */
export default async function BillingPage({ params }: PageProps<"/[locale]/app/billing">) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "app.billing" });
  return <PageHeader title={t("title")} description={t("subtitle")} />;
}
