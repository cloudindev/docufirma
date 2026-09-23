"use client";

import { Ban, CheckCircle2, Clock, Hourglass, Link2Off, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";

const ICONS = {
  invalid: Link2Off,
  expired: Hourglass,
  canceled: Ban,
  declined: XCircle,
  already_signed: CheckCircle2,
  not_your_turn: Clock,
  rate_limited: Clock,
} as const;

export function SigningState({ state }: { state: string }) {
  const t = useTranslations("signing.states");
  const key = (state in ICONS ? state : "invalid") as keyof typeof ICONS;
  const Icon = ICONS[key];
  return (
    <Card className="mx-auto max-w-lg space-y-4 p-8 text-center" role="status">
      <span
        className={
          key === "already_signed"
            ? "mx-auto inline-flex size-14 items-center justify-center rounded-full bg-success/12 text-success"
            : "mx-auto inline-flex size-14 items-center justify-center rounded-full bg-bg-tint text-primary"
        }
      >
        <Icon className="size-7" strokeWidth={1.75} aria-hidden />
      </span>
      <h1 className="text-2xl">{t(`${key}.title`)}</h1>
      <p className="text-ink-muted">{t(`${key}.body`)}</p>
    </Card>
  );
}
