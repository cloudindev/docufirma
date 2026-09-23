import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EnvelopeFilters } from "@/components/app/envelope-filters";
import { EnvelopeList } from "@/components/app/envelope-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { isEnvelopeStatus, listEnvelopes } from "@/lib/data/envelopes";
import { Link } from "@/lib/i18n/navigation";
import { resolveLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/envelopes">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "app.envelopes" });
  return { title: t("metaTitle") };
}

export default async function EnvelopesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/app/envelopes">) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "app.envelopes" });
  const tNav = await getTranslations({ locale, namespace: "app.dashboard" });
  const sp = await searchParams;
  const status = isEnvelopeStatus(sp.status) ? sp.status : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);

  const supabase = await createClient();
  const { items, total, pageSize } = await listEnvelopes(supabase, { status, q, page });
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const query = (p: number) => ({
    ...(status ? { status } : {}),
    ...(q ? { q } : {}),
    ...(p > 1 ? { page: String(p) } : {}),
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Button asChild>
            <Link href="/app/send">
              <Plus /> {tNav("newEnvelope")}
            </Link>
          </Button>
        }
      />
      <EnvelopeFilters status={status ?? "all"} q={q} />
      {items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("emptyTitle")}
          description={status || q ? t("emptyFiltered") : undefined}
        />
      ) : (
        <>
          <EnvelopeList items={items} locale={locale} />
          <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Pagination">
            <p className="text-sm text-ink-muted">{t("pagination.summary", { from, to, total })}</p>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={{ pathname: "/app/envelopes", query: query(page - 1) }}>
                    {t("pagination.previous")}
                  </Link>
                </Button>
              ) : null}
              {to < total ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={{ pathname: "/app/envelopes", query: query(page + 1) }}>
                    {t("pagination.next")}
                  </Link>
                </Button>
              ) : null}
            </div>
          </nav>
        </>
      )}
    </>
  );
}
