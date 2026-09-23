import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { requireProfile } from "@/lib/auth/session";
import { redirect } from "@/lib/i18n/navigation";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/onboarding">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as "es", namespace: "onboarding" });
  return { title: t("metaTitle") };
}

export default async function OnboardingPage({ params }: PageProps<"/[locale]/app/onboarding">) {
  const locale = await resolveLocale(params);
  const profile = await requireProfile(locale);
  if (profile.onboarding_completed) redirect({ href: "/app", locale });

  return (
    <div className="min-h-dvh bg-bg-soft">
      <header className="container-page flex h-16 items-center">
        <Logo />
      </header>
      <main className="container-page flex justify-center pt-6 pb-16 sm:pt-12">
        <OnboardingWizard
          defaults={{
            firstName: profile.first_name ?? "",
            lastName: profile.last_name ?? "",
            companyName: profile.company_name ?? "",
            locale: profile.locale === "en" ? "en" : "es",
          }}
        />
      </main>
    </div>
  );
}
