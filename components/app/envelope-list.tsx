import { ChevronRight, FileText } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { EnvelopeStatusBadge } from "@/components/app/status-badge";
import type { EnvelopeListItem } from "@/lib/data/envelopes";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";

/** Responsive list: table on desktop, stacked cards on mobile. */
export async function EnvelopeList({
  items,
  locale,
}: {
  items: EnvelopeListItem[];
  locale: Locale;
}) {
  const t = await getTranslations({ locale, namespace: "app.envelopes" });
  const format = await getFormatter({ locale });
  const now = new Date();

  const hrefFor = (e: EnvelopeListItem) =>
    e.status === "draft"
      ? ({ pathname: "/app/send/[id]", params: { id: e.id } } as const)
      : ({ pathname: "/app/envelopes/[id]", params: { id: e.id } } as const);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg shadow-card">
      <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_auto_minmax(110px,auto)_20px] items-center gap-4 border-b border-border px-5 py-3 text-xs font-medium tracking-wide text-ink-muted uppercase md:grid">
        <span>{t("columns.title")}</span>
        <span>{t("columns.signers")}</span>
        <span>{t("columns.status")}</span>
        <span className="text-right">{t("columns.updated")}</span>
        <span />
      </div>
      <ul className="divide-y divide-border">
        {items.map((e) => {
          const signed = e.signers.filter((s) => s.status === "signed").length;
          return (
            <li key={e.id}>
              <Link
                href={hrefFor(e)}
                className="grid gap-2 px-5 py-4 transition-colors hover:bg-bg-soft/70 focus-visible:bg-bg-soft md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_auto_minmax(110px,auto)_20px] md:items-center md:gap-4"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-bg-tint text-primary">
                    <FileText className="size-4.5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{e.title || t("untitled")}</span>
                    <span className="block text-xs text-ink-muted">
                      {t("documentsCount", { count: e.documents })}
                    </span>
                  </span>
                </span>
                <span className="min-w-0 text-sm text-ink-muted">
                  <span className="block truncate">
                    {e.signers.map((s) => s.name).join(", ") || "—"}
                  </span>
                  {e.signers.length > 0 && e.status !== "draft" ? (
                    <span className="block text-xs">
                      {t("signersProgress", { signed, total: e.signers.length })}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center justify-between gap-3 md:block">
                  <EnvelopeStatusBadge status={e.status} finalizing={e.finalizing} />
                  <span className="text-xs text-ink-muted md:hidden">
                    {format.relativeTime(new Date(e.updatedAt), now)}
                  </span>
                </span>
                <span className="hidden text-right text-sm text-ink-muted md:block">
                  {format.relativeTime(new Date(e.updatedAt), now)}
                </span>
                <ChevronRight className="hidden size-4 text-ink-muted md:block" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
