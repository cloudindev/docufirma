import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { LegalText } from "@/components/marketing/legal-text";
import { Link } from "@/lib/i18n/navigation";
import { routing } from "@/lib/i18n/routing";
import { resolveLocale } from "@/lib/i18n/server";
import { isLegalSlug, LEGAL_SLUGS, LEGAL_UPDATED_AT } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import esMessages from "@/messages/es.json";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => LEGAL_SLUGS.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/legal/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const locale = await resolveLocale(params);
  if (!isLegalSlug(slug)) return {};
  const t = await getTranslations({ locale, namespace: "legal" });
  return pageMetadata({
    href: { pathname: "/legal/[slug]", params: { slug } },
    locale,
    title: t(`nav.${slug}`),
    description: t(`pages.${slug}.description`),
  });
}

export default async function LegalPage({ params }: PageProps<"/[locale]/legal/[slug]">) {
  const { slug } = await params;
  const locale = await resolveLocale(params);
  if (!isLegalSlug(slug)) notFound();
  const t = await getTranslations({ locale, namespace: "legal" });
  const format = await getFormatter({ locale });
  // es.json is the source of truth for the structure (en.json mirrors its keys; a unit test enforces it).
  const sections = Object.keys(esMessages.legal.pages[slug].sections);

  return (
    <div className="container-page grid gap-10 py-14 sm:py-20 lg:grid-cols-[240px_1fr]">
      <nav aria-label={t("nav.legal-notice")} className="lg:sticky lg:top-24 lg:self-start">
        <ul className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1">
          {LEGAL_SLUGS.map((s) => (
            <li key={s}>
              <Link
                href={{ pathname: "/legal/[slug]", params: { slug: s } }}
                aria-current={s === slug ? "page" : undefined}
                className={cn(
                  "block rounded-full px-3.5 py-2 text-sm whitespace-nowrap transition-colors lg:rounded-lg",
                  s === slug
                    ? "bg-bg-tint font-medium text-primary"
                    : "text-ink-muted hover:bg-bg-soft hover:text-ink",
                )}
              >
                {t(`nav.${s}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <article className="max-w-3xl space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl">{t(`nav.${slug}`)}</h1>
          <p className="text-sm text-ink-muted">
            {t("updated", { date: format.dateTime(new Date(LEGAL_UPDATED_AT), "short") })}
          </p>
        </header>
        {sections.map((key) => {
          // Raw strings: legal copy is plain text with a tiny Markdown subset (see LegalText).
          // Intro sections have no heading ("h" omitted in messages).
          const hKey = `pages.${slug}.sections.${key}.h` as "pages.privacy.sections.s2.h";
          const pKey = `pages.${slug}.sections.${key}.p` as "pages.privacy.sections.s1.p";
          const heading = t.has(hKey) ? (t.raw(hKey) as string) : null;
          const body = t.raw(pKey) as string;
          return (
            <section key={key} className="space-y-3">
              {heading && <h2 className="text-xl">{heading}</h2>}
              <LegalText text={body} locale={locale} />
            </section>
          );
        })}
      </article>
    </div>
  );
}
