import { ArrowRight, Clock, FileCheck2, PenLine, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EnvelopeList } from "@/components/app/envelope-list";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireProfile } from "@/lib/auth/session";
import { LIMITS } from "@/lib/config";
import { getCredits } from "@/lib/credits";
import { getDashboardStats, listEnvelopes } from "@/lib/data/envelopes";
import { Link } from "@/lib/i18n/navigation";
import { resolveLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/app">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "app.dashboard" });
  return { title: t("metaTitle") };
}

export default async function DashboardPage({ params }: PageProps<"/[locale]/app">) {
  const locale = await resolveLocale(params);
  const profile = await requireProfile(locale);
  const t = await getTranslations({ locale, namespace: "app.dashboard" });
  const supabase = await createClient();
  const [stats, credits, recent] = await Promise.all([
    getDashboardStats(supabase),
    getCredits(supabase, profile.id),
    listEnvelopes(supabase, { pageSize: 5 }),
  ]);

  const kpis = [
    { key: "pending", value: stats.pending, hint: t("kpi.pendingHint"), icon: Clock },
    { key: "signed", value: stats.signedThisMonth, hint: t("kpi.signedHint"), icon: FileCheck2 },
    {
      key: "credits",
      value: credits.total,
      hint: t("kpi.creditsHint", { monthly: credits.monthly, pack: credits.pack }),
      icon: PenLine,
    },
  ] as const;

  return (
    <>
      <PageHeader
        title={t("greeting", { name: profile.first_name ?? "" })}
        description={t("subtitle")}
        actions={
          <Button asChild size="lg">
            <Link href="/app/send">
              <Plus /> {t("newEnvelope")}
            </Link>
          </Button>
        }
      />

      {credits.total <= LIMITS.lowCreditsThreshold ? (
        <Alert
          variant="warning"
          className="mb-6"
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href="/app/billing">{t("lowCreditsCta")}</Link>
            </Button>
          }
        >
          {t("lowCredits", { count: credits.total })}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map(({ key, value, hint, icon: Icon }) => (
          <Card key={key} className="flex items-start justify-between gap-4 p-5">
            <div className="space-y-1">
              <p className="text-sm font-medium text-ink-muted">{t(`kpi.${key}`)}</p>
              <p className="text-3xl font-semibold tracking-tight">{value}</p>
              <p className="text-xs text-ink-muted">{hint}</p>
            </div>
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-bg-tint text-primary">
              <Icon className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
          </Card>
        ))}
      </div>

      <section className="mt-10 space-y-4" aria-labelledby="recent-title">
        <div className="flex items-center justify-between">
          <h2 id="recent-title" className="text-lg">
            {t("recent")}
          </h2>
          {recent.items.length > 0 ? (
            <Button asChild variant="tertiary">
              <Link href="/app/envelopes">
                {t("viewAll")} <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </div>
        {recent.items.length === 0 ? (
          <EmptyState
            icon={PenLine}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={
              <Button asChild size="lg">
                <Link href="/app/send">
                  <Plus /> {t("emptyCta")}
                </Link>
              </Button>
            }
          />
        ) : (
          <EnvelopeList items={recent.items} locale={locale} />
        )}
      </section>
    </>
  );
}
