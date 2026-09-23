import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { SUPPORT_EMAIL } from "@/lib/config";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { LEGAL_SLUGS } from "@/lib/legal";

export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "marketing" });
  const tl = await getTranslations({ locale, namespace: "legal.nav" });
  const year = new Date().getFullYear();

  const linkClass = "text-sm text-ink-muted transition-colors hover:text-ink";
  return (
    <footer className="border-t border-border bg-bg">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-ink-muted">{t("footer.tagline")}</p>
          <p className="text-xs text-ink-muted">{t("footer.madeIn")}</p>
        </div>
        <nav aria-label={t("footer.product")} className="space-y-3">
          <h2 className="text-sm font-semibold">{t("footer.product")}</h2>
          <ul className="space-y-2.5">
            <li>
              <Link href="/how-it-works" className={linkClass}>
                {t("nav.howItWorks")}
              </Link>
            </li>
            <li>
              <Link href="/pricing" className={linkClass}>
                {t("nav.pricing")}
              </Link>
            </li>
            <li>
              <Link href="/verify" className={linkClass}>
                {t("nav.verify")}
              </Link>
            </li>
            <li>
              <Link href="/register" className={linkClass}>
                {t("nav.cta")}
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label={t("footer.legal")} className="space-y-3">
          <h2 className="text-sm font-semibold">{t("footer.legal")}</h2>
          <ul className="space-y-2.5">
            {LEGAL_SLUGS.map((slug) => (
              <li key={slug}>
                <Link href={{ pathname: "/legal/[slug]", params: { slug } }} className={linkClass}>
                  {tl(slug)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t("footer.help")} className="space-y-3">
          <h2 className="text-sm font-semibold">{t("footer.help")}</h2>
          <ul className="space-y-2.5">
            <li>
              <Link href={{ pathname: "/", hash: "faq" }} className={linkClass}>
                {t("footer.faq")}
              </Link>
            </li>
            <li>
              <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
                {t("footer.contact")}
              </a>
            </li>
          </ul>
          <h2 className="pt-3 text-sm font-semibold">{t("footer.language")}</h2>
          <ul className="flex gap-3">
            <li>
              <Link href="/" locale="es" className={linkClass} lang="es">
                Español
              </Link>
            </li>
            <li>
              <Link href="/" locale="en" className={linkClass} lang="en">
                English
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="container-page py-6 text-xs text-ink-muted">{t("footer.rights", { year })}</p>
      </div>
    </footer>
  );
}
