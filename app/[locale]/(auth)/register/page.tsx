import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { RegisterForm } from "@/components/auth/register-form";
import { Link } from "@/lib/i18n/navigation";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/register">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as "es", namespace: "auth.register" });
  return { title: t("metaTitle") };
}

export default async function RegisterPage({ params }: PageProps<"/[locale]/register">) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "auth" });
  const googleEnabled = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";
  const trialCredits = Number(process.env.TRIAL_CREDITS ?? 3);

  return (
    <>
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl">{t("register.title")}</h1>
        <p className="text-ink-muted">{t("register.subtitle", { credits: trialCredits })}</p>
      </div>
      {googleEnabled ? (
        <>
          <GoogleButton />
          <OrDivider label={t("orDivider")} />
        </>
      ) : null}
      <RegisterForm />
      <p className="mt-8 text-center text-sm text-ink-muted">
        {t("register.haveAccount")}{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t("register.login")}
        </Link>
      </p>
    </>
  );
}
