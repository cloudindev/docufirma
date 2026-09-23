import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { Link } from "@/lib/i18n/navigation";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as "es", namespace: "auth.forgot" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function ForgotPasswordPage({
  params,
}: PageProps<"/[locale]/forgot-password">) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "auth.forgot" });
  return (
    <>
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl">{t("title")}</h1>
        <p className="text-ink-muted">{t("subtitle")}</p>
      </div>
      <ForgotPasswordForm />
      <Link
        href="/login"
        className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="size-4" /> {t("back")}
      </Link>
    </>
  );
}
