import { CheckCircle2, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { SignatureIllustration } from "@/components/brand/illustrations";
import { Link } from "@/lib/i18n/navigation";
import { resolveLocale } from "@/lib/i18n/server";

export default async function AuthLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "auth.panel" });
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)] xl:grid-cols-[1fr_640px]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Link href="/" className="self-start rounded-lg">
          <Logo />
        </Link>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
      <aside className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-16 size-80 rounded-full bg-[#4F7BFF]/40 blur-3xl"
        />
        <div className="relative space-y-8">
          <h2 className="max-w-md text-3xl leading-tight font-semibold text-white">{t("title")}</h2>
          <ul className="space-y-4 text-white/90">
            {(["one", "two", "three"] as const).map((k) => (
              <li key={k} className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-white"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span>{t(`points.${k}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <SignatureIllustration className="relative mx-auto w-full max-w-sm drop-shadow-2xl" />
        <p className="relative flex items-center gap-2 text-sm text-white/80">
          <ShieldCheck className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          {t("quote")}
        </p>
      </aside>
    </div>
  );
}
