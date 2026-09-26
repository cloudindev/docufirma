"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CreditCard, MessageSquareLock, PenLine, TriangleAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { saveAutoRecharge } from "@/app/[locale]/app/(shell)/settings/actions";
import { BillingButton } from "@/components/app/billing-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { useTranslateError } from "@/lib/hooks/use-translate-error";
import { useRouter } from "@/lib/i18n/navigation";
import { type AutoRechargeInput, autoRechargeSchema } from "@/lib/profile/schemas";

export type AutoRechargePack = { slug: string; credits: number; priceCents: number };
export type AutoRechargeState = {
  enabled: boolean;
  threshold: number;
  packSlug: string;
  lastSuccessAt: string | null;
  lastError: string | null;
};
export type SavedCardInfo = { brand: string; last4: string; expMonth: number; expYear: number };

function KindForm({
  kind,
  packs,
  state,
}: {
  kind: "signatures" | "sms";
  packs: AutoRechargePack[];
  state: AutoRechargeState;
}) {
  const t = useTranslations("app.settings.autoRecharge");
  const tc = useTranslations("app.common");
  const te = useTranslateError();
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<AutoRechargeInput>({
    resolver: zodResolver(autoRechargeSchema),
    defaultValues: {
      kind,
      enabled: state.enabled,
      threshold: state.threshold,
      packSlug: state.packSlug || packs[0]?.slug || "",
    },
  });
  const enabled = useWatch({ control: form.control, name: "enabled" });
  const errors = form.formState.errors;
  const eur = (cents: number) => format.number(cents / 100, "eur");
  const Icon = kind === "sms" ? MessageSquareLock : PenLine;
  const id = (f: string) => `ar-${kind}-${f}`;

  return (
    <form
      noValidate
      aria-labelledby={id("title")}
      className="space-y-4 rounded-xl border border-border p-4 sm:p-5"
      onSubmit={form.handleSubmit((values) =>
        start(async () => {
          const res = await saveAutoRecharge(values);
          if (!res.ok) return void toast.error(t("error"));
          toast.success(t("saved"));
          form.reset(values);
          router.refresh();
        }),
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-tint text-primary">
            <Icon className="size-4.5" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h3 id={id("title")} className="text-base">
              {t(`${kind}.title`)}
            </h3>
            <p className="text-sm text-ink-muted">{t(`${kind}.hint`)}</p>
          </div>
        </div>
        <Controller
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <Switch
              id={id("enabled")}
              aria-label={t("enable", { kind: t(`${kind}.title`) })}
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={id("threshold")}
          label={t(`${kind}.threshold`)}
          hint={t("thresholdHint")}
          error={te(errors.threshold?.message)}
        >
          <Input
            id={id("threshold")}
            type="number"
            inputMode="numeric"
            min={0}
            max={1000}
            disabled={!enabled}
            aria-invalid={!!errors.threshold}
            {...form.register("threshold")}
          />
        </FormField>
        <FormField id={id("pack")} label={t("pack")} error={te(errors.packSlug?.message)}>
          <NativeSelect id={id("pack")} disabled={!enabled} {...form.register("packSlug")}>
            {packs.map((p) => (
              <option key={p.slug} value={p.slug}>
                {t(`${kind}.option`, { credits: p.credits, price: eur(p.priceCents) })}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      {state.lastError && !state.enabled ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("paused")}
        </p>
      ) : state.lastSuccessAt ? (
        <p className="text-xs text-ink-muted">
          {t("lastSuccess", { date: format.dateTime(new Date(state.lastSuccessAt), "short") })}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={!form.formState.isDirty}>
          {tc("save")}
        </Button>
      </div>
    </form>
  );
}

export function AutoRechargeCard({
  signaturePacks,
  smsPacks,
  signatures,
  sms,
  card,
  hasCustomer,
}: {
  signaturePacks: AutoRechargePack[];
  smsPacks: AutoRechargePack[];
  signatures: AutoRechargeState;
  sms: AutoRechargeState;
  card: SavedCardInfo | null;
  hasCustomer: boolean;
}) {
  const t = useTranslations("app.settings.autoRecharge");
  return (
    <Card id="auto-recharge">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg-soft p-4 text-sm">
          <span className="flex items-center gap-2">
            <CreditCard className="size-4 text-ink-muted" strokeWidth={1.75} aria-hidden />
            {card
              ? t("card", {
                  brand: card.brand.toUpperCase(),
                  last4: card.last4,
                  exp: `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}`,
                })
              : t("noCard")}
          </span>
          {hasCustomer ? (
            <BillingButton action={{ kind: "portal" }} size="sm" variant="secondary">
              {card ? t("changeCard") : t("addCard")}
            </BillingButton>
          ) : null}
        </div>
        <KindForm kind="signatures" packs={signaturePacks} state={signatures} />
        <KindForm kind="sms" packs={smsPacks} state={sms} />
      </CardContent>
      <CardFooter>
        <p className="text-xs text-ink-muted">{t("footnote")}</p>
      </CardFooter>
    </Card>
  );
}
