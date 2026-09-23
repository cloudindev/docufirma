import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { resolveLocale } from "@/lib/i18n/server";

export default async function MarketingLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = await resolveLocale(params);
  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
