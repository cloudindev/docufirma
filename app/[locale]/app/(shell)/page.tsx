import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { requireProfile } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";

export default async function DashboardPage({ params }: PageProps<"/[locale]/app">) {
  const locale = await resolveLocale(params);
  const profile = await requireProfile(locale);
  const t = await getTranslations({ locale, namespace: "common" });
  return (
    <main className="container-page py-10">
      <PageHeader title={`DocuFirma · ${profile.first_name ?? ""}`} description={t("comingSoon")} />
    </main>
  );
}
