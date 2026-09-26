import { MessageSquareLock, CalendarClock, Package, PenLine } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { BillingButton } from "@/components/app/billing-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireProfile } from "@/lib/auth/session";
import { getCredits, getSmsBalance } from "@/lib/credits";
import { resolveLocale } from "@/lib/i18n/server";
import { getPackOffers, getSmsPackOffers, planOffer } from "@/lib/pricing";
import { listInvoices } from "@/lib/stripe/billing";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/billing">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "app.billing" });
  return { title: t("metaTitle") };
}

export default async function BillingPage({
  params,
  searchParams,
}: PageProps<"/[locale]/app/billing">) {
  const locale = await resolveLocale(params);
  const profile = await requireProfile(locale);
  const sp = await searchParams;
  const tp = await getTranslations({ locale, namespace: "app.billing" });
  const t = await getTranslations({ locale, namespace: "billing" });
  const format = await getFormatter({ locale });
  const supabase = await createClient();

  const [credits, { data: subs }, packs, invoices, smsPacks, smsBalance] = await Promise.all([
    getCredits(supabase, profile.id),
    supabase.from("subscriptions").select("*").order("created_at", { ascending: false }).limit(1),
    getPackOffers(),
    listInvoices(profile.stripe_customer_id),
    getSmsPackOffers(),
    getSmsBalance(supabase, profile.id).catch(() => 0),
  ]);
  const sub = subs?.[0];
  const hasLiveSub =
    sub &&
    ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"].includes(sub.status);
  const eur = (cents: number) => format.number(cents / 100, "eur");
  const date = (iso: string | null) => (iso ? format.dateTime(new Date(iso), "short") : "—");
  const checkout =
    sp.checkout === "success" ? "success" : sp.checkout === "canceled" ? "canceled" : null;
  const used = Math.max(0, credits.monthlyGranted - credits.monthly);

  return (
    <>
      <PageHeader title={tp("title")} description={tp("subtitle")} />
      {checkout ? (
        <Alert variant={checkout === "success" ? "success" : "info"} className="mb-6">
          {t(`checkout.${checkout}`)}
        </Alert>
      ) : null}
      {sub && (sub.status === "past_due" || sub.status === "unpaid") ? (
        <Alert
          variant="danger"
          className="mb-6"
          action={
            <BillingButton action={{ kind: "portal" }} size="sm" variant="secondary">
              {t("pastDueCta")}
            </BillingButton>
          }
        >
          {t("pastDue")}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-5 text-primary" strokeWidth={1.75} /> {t("plan.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasLiveSub && sub ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-2xl font-semibold">{t("plan.pro")}</p>
                  <Badge
                    variant={
                      sub.status === "active" || sub.status === "trialing" ? "success" : "warning"
                    }
                    dot
                  >
                    {t(`plan.status.${sub.status}`)}
                  </Badge>
                </div>
                <p className="text-sm text-ink-muted">
                  {t("plan.price", { price: eur(planOffer.priceCents) })}
                </p>
                <p className="text-sm">
                  {sub.cancel_at_period_end
                    ? t("plan.cancels", { date: date(sub.current_period_end) })
                    : t("plan.renews", { date: date(sub.current_period_end) })}
                </p>
                <div className="space-y-2">
                  <BillingButton action={{ kind: "portal" }} variant="secondary">
                    {t("plan.manage")}
                  </BillingButton>
                  <p className="text-xs text-ink-muted">{t("plan.manageHint")}</p>
                </div>
              </>
            ) : (
              <>
                <p className="text-2xl font-semibold">{t("plan.none")}</p>
                <p className="text-sm text-ink-muted">
                  {t("plan.noneBody", { credits: planOffer.credits })}
                </p>
                <p className="text-sm font-medium">
                  {t("plan.price", { price: eur(planOffer.priceCents) })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <BillingButton action={{ kind: "subscribe" }} size="lg">
                    {t("plan.subscribe")}
                  </BillingButton>
                  {profile.stripe_customer_id ? (
                    <BillingButton action={{ kind: "portal" }} variant="secondary" size="lg">
                      {t("plan.manage")}
                    </BillingButton>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PenLine className="size-5 text-primary" strokeWidth={1.75} /> {t("usage.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-ink-muted">{t("usage.total")}</p>
              <p className="text-3xl font-semibold">{credits.total}</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t("usage.monthly")}</span>
                <span className="text-ink-muted">
                  {t("usage.monthlyValue", { used, granted: credits.monthlyGranted })}
                </span>
              </div>
              <Progress value={used} max={credits.monthlyGranted || 1} label={t("usage.monthly")} />
              {credits.monthlyExpiresAt ? (
                <p className="text-xs text-ink-muted">
                  {t("usage.monthlyExpires", { date: date(credits.monthlyExpiresAt) })}
                </p>
              ) : null}
            </div>
            <div className="flex items-start justify-between gap-4 rounded-xl bg-bg-soft p-4">
              <div>
                <p className="text-sm font-medium">{t("usage.pack")}</p>
                <p className="text-xs text-ink-muted">{t("usage.packHint")}</p>
              </div>
              <p className="text-xl font-semibold">{credits.pack}</p>
            </div>
            <p className="text-xs text-ink-muted">
              {t("usage.reserved", { count: credits.reserved })}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="mt-8 space-y-4" aria-labelledby="packs-title">
        <div>
          <h2 id="packs-title" className="flex items-center gap-2 text-lg">
            <Package className="size-5 text-primary" strokeWidth={1.75} /> {t("packs.title")}
          </h2>
          <p className="text-sm text-ink-muted">{t("packs.subtitle")}</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-3">
          {packs.map((p) => (
            <li key={p.slug}>
              <Card interactive className="flex h-full flex-col gap-3 p-5">
                <p className="font-medium">{t("packs.credits", { credits: p.credits })}</p>
                <p className="text-3xl font-semibold tracking-tight">{eur(p.priceCents)}</p>
                <p className="text-xs text-ink-muted">
                  {t("packs.unit", { price: eur(Math.round(p.priceCents / p.credits)) })}
                </p>
                <BillingButton
                  action={{ kind: "pack", slug: p.slug }}
                  variant="secondary"
                  className="mt-auto"
                >
                  {t("packs.buy")}
                </BillingButton>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {smsPacks.length > 0 ? (
        <section id="sms" className="mt-8 space-y-4" aria-labelledby="sms-title">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="sms-title" className="flex items-center gap-2 text-lg">
                <MessageSquareLock className="size-5 text-primary" strokeWidth={1.75} />{" "}
                {t("sms.title")}
              </h2>
              <p className="text-sm text-ink-muted">{t("sms.subtitle")}</p>
            </div>
            <p className="text-sm">
              {t.rich("sms.balance", {
                count: smsBalance,
                strong: (c) => <strong className="text-lg font-semibold">{c}</strong>,
              })}
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-3">
            {smsPacks.map((p) => (
              <li key={p.slug}>
                <Card interactive className="flex h-full flex-col gap-3 p-5">
                  <p className="font-medium">{t("sms.credits", { credits: p.credits })}</p>
                  <p className="text-3xl font-semibold tracking-tight">{eur(p.priceCents)}</p>
                  <p className="text-xs text-ink-muted">
                    {t("sms.unit", {
                      price: format.number(p.priceCents / p.credits / 100, {
                        style: "currency",
                        currency: "EUR",
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 3,
                      }),
                    })}
                  </p>
                  <BillingButton
                    action={{ kind: "pack", slug: p.slug }}
                    variant="secondary"
                    className="mt-auto"
                  >
                    {t("sms.buy")}
                  </BillingButton>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>{t("invoices.title")}</CardTitle>
          {invoices === null ? (
            <CardDescription>{t("invoices.unavailable")}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {invoices && invoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("invoices.number")}</TableHead>
                  <TableHead>{t("invoices.date")}</TableHead>
                  <TableHead>{t("invoices.amount")}</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.number ?? "—"}</TableCell>
                    <TableCell>{date(i.date)}</TableCell>
                    <TableCell>
                      {format.number(i.total / 100, {
                        style: "currency",
                        currency: i.currency.toUpperCase(),
                      })}
                    </TableCell>
                    <TableCell className="space-x-3 text-right text-sm">
                      {i.url ? (
                        <a
                          href={i.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          {t("invoices.view")}
                        </a>
                      ) : null}
                      {i.pdf ? (
                        <a
                          href={i.pdf}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          {t("invoices.download")}
                        </a>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : invoices ? (
            <p className="text-sm text-ink-muted">{t("invoices.empty")}</p>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
