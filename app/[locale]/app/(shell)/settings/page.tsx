import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  DeleteAccount,
  LogoForm,
  PasswordForm,
  PreferencesForm,
  ProfileForm,
} from "@/components/app/settings-forms";
import { PageHeader } from "@/components/ui/page-header";
import { requireProfile } from "@/lib/auth/session";
import { brandingLogoUrl } from "@/lib/email";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/settings">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "app.settings" });
  return { title: t("metaTitle") };
}

export default async function SettingsPage({ params }: PageProps<"/[locale]/app/settings">) {
  const locale = await resolveLocale(params);
  const profile = await requireProfile(locale);
  const t = await getTranslations({ locale, namespace: "app.settings" });
  const logo = brandingLogoUrl(profile.id, profile.logo_path);
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid max-w-3xl gap-6">
        <ProfileForm
          email={profile.email}
          defaults={{
            firstName: profile.first_name ?? "",
            lastName: profile.last_name ?? "",
            companyName: profile.company_name ?? "",
            taxId: profile.tax_id ?? "",
          }}
        />
        <LogoForm logoUrl={logo ? `/api/branding/${profile.id}` : null} />
        <PreferencesForm
          defaults={{
            locale: profile.locale === "en" ? "en" : "es",
            notifyOnView: profile.notify_on_view,
            notifyOnComplete: profile.notify_on_complete,
          }}
        />
        <PasswordForm />
        <DeleteAccount email={profile.email} />
      </div>
    </>
  );
}
