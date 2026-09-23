import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import { Link } from "@/lib/i18n/navigation";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as "es", namespace: "auth.login" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const locale = await resolveLocale(params);
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const t = await getTranslations({ locale, namespace: "auth" });
  const googleEnabled = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";

  return (
    <>
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl">{t("login.title")}</h1>
        <p className="text-ink-muted">{t("login.subtitle")}</p>
      </div>
      {googleEnabled ? (
        <>
          <GoogleButton next={next} />
          <OrDivider label={t("orDivider")} />
        </>
      ) : null}
      <LoginForm next={next} initialError={error === "linkExpired" ? "linkExpired" : undefined} />
      <p className="mt-8 text-center text-sm text-ink-muted">
        {t("login.noAccount")}{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          {t("login.register")}
        </Link>
      </p>
    </>
  );
}
