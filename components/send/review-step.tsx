"use client";

import { ArrowLeft, FileText, Send, Settings2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { EnvelopeSettingsInput } from "@/lib/envelopes/schemas";
import { formatBytes } from "@/lib/utils";
import type { WizardDocument } from "./types";

function Section({
  icon: Icon,
  title,
  editLabel,
  onEdit,
  children,
}: {
  icon: typeof FileText;
  title: string;
  editLabel: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base">
          <Icon className="size-4.5 text-primary" strokeWidth={1.75} aria-hidden /> {title}
        </h3>
        <Button variant="tertiary" size="sm" onClick={onEdit}>
          {editLabel}
        </Button>
      </div>
      {children}
    </Card>
  );
}

export function ReviewStep({
  form,
  documents,
  credits,
  sending,
  error,
  onEdit,
  onBack,
  onSend,
}: {
  form: UseFormReturn<EnvelopeSettingsInput>;
  documents: WizardDocument[];
  credits: number;
  sending: boolean;
  error?: string;
  onEdit: (step: 0 | 1) => void;
  onBack: () => void;
  onSend: () => void;
}) {
  const t = useTranslations("send.review");
  const tl = useTranslations("common.languages");
  const values = useWatch({ control: form.control });
  const signers = values.signers ?? [];
  const cost = signers.length;
  const enough = credits >= cost;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl sm:text-2xl">{t("title")}</h2>
        <p className="text-ink-muted">{t("subtitle")}</p>
      </header>

      <Card className="p-5">
        <p className="text-lg font-semibold break-words">{values.title}</p>
        {values.message ? (
          <p className="mt-2 text-sm whitespace-pre-line text-ink-muted">{values.message}</p>
        ) : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Section
          icon={FileText}
          title={t("documents")}
          editLabel={t("edit")}
          onEdit={() => onEdit(0)}
        >
          <ul className="space-y-2 text-sm">
            {documents.map((d) => (
              <li key={d.id} className="flex justify-between gap-3">
                <span className="truncate">{d.name}</span>
                <span className="shrink-0 text-ink-muted">{formatBytes(d.sizeBytes)}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section icon={Users} title={t("signers")} editLabel={t("edit")} onEdit={() => onEdit(1)}>
          <ol className="space-y-2 text-sm">
            {signers.map((s, i) => (
              <li key={`${s?.email}-${i}`} className="min-w-0">
                <span className="font-medium">
                  {values.sequential ? `${i + 1}. ` : ""}
                  {s?.firstName} {s?.lastName}
                </span>
                <span className="block truncate text-ink-muted">{s?.email}</span>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <Section
        icon={Settings2}
        title={t("settings")}
        editLabel={t("edit")}
        onEdit={() => onEdit(1)}
      >
        <ul className="grid gap-1 text-sm text-ink-muted sm:grid-cols-2">
          {signers.length > 1 ? (
            <li>
              {t("order")}: {values.sequential ? t("orderSequential") : t("orderParallel")}
            </li>
          ) : null}
          <li>{t("expiresIn", { days: Number(values.expiryDays) })}</li>
          <li>{t("remindEvery", { days: Number(values.reminderDays) })}</li>
          <li>{t("language", { language: tl(values.locale === "en" ? "en" : "es") })}</li>
        </ul>
      </Section>

      <Alert
        variant={enough ? "info" : "warning"}
        title={
          enough
            ? t("cost", { cost, available: credits })
            : t("insufficient", { cost, available: credits })
        }
      >
        {t("costHint")}
      </Alert>

      {error ? <Alert variant="danger">{error}</Alert> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onBack} disabled={sending}>
          <ArrowLeft /> {t("back")}
        </Button>
        <Button size="lg" onClick={onSend} loading={sending}>
          {sending ? null : <Send />} {t("send")}
        </Button>
      </div>
    </div>
  );
}
