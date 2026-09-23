"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

const FILTERS = [
  "all",
  "draft",
  "sent",
  "viewed",
  "completed",
  "declined",
  "expired",
  "canceled",
] as const;

export function EnvelopeFilters({ status, q }: { status: string; q: string }) {
  const t = useTranslations("app.envelopes");
  const router = useRouter();
  const [pending, start] = useTransition();

  const go = (next: { status?: string; q?: string }) =>
    start(() => {
      const query: Record<string, string> = {};
      const s = next.status ?? status;
      const text = next.q ?? q;
      if (s && s !== "all") query.status = s;
      if (text) query.q = text;
      router.replace({ pathname: "/app/envelopes", query });
    });

  return (
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div
        role="tablist"
        aria-label={t("columns.status")}
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            type="button"
            aria-selected={status === f}
            onClick={() => go({ status: f })}
            className={cn(
              "h-9 shrink-0 cursor-pointer rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
              status === f
                ? "bg-ink text-white"
                : "bg-bg text-ink-muted ring-1 ring-border ring-inset hover:text-ink",
            )}
          >
            {t(`filters.${f}`)}
          </button>
        ))}
      </div>
      <form
        role="search"
        className="relative lg:w-72"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: new FormData(e.currentTarget).get("q")?.toString().trim() ?? "" });
        }}
      >
        {pending ? (
          <Spinner className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-muted" />
        ) : (
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden
          />
        )}
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="h-10 rounded-full pl-10"
        />
      </form>
    </div>
  );
}
