import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "@/components/auth/password-forms";
import { requireUser } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/reset-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as "es", namespace: "auth.reset" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Reached from the recovery email: /auth/confirm establishes a session first. */
export default async function ResetPasswordPage({ params }: PageProps<"/[locale]/reset-password">) {
  const locale = await resolveLocale(params);
  await requireUser(locale);
  const t = await getTranslations({ locale, namespace: "auth.reset" });
  return (
    <>
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl">{t("title")}</h1>
        <p className="text-ink-muted">{t("subtitle")}</p>
      </div>
      <ResetPasswordForm />
    </>
  );
}
