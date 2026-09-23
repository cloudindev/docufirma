"use client";

import { CreditCard, ExternalLink, Package } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  openCustomerPortal,
  startPackCheckout,
  startSubscriptionCheckout,
} from "@/app/[locale]/app/(shell)/billing/actions";
import { Button, type ButtonProps } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";

type Kind = { kind: "subscribe" } | { kind: "portal" } | { kind: "pack"; slug: string };

export function BillingButton({
  action,
  children,
  ...props
}: { action: Kind; children: React.ReactNode } & Omit<ButtonProps, "onClick" | "action">) {
  const t = useTranslations("billing.errors");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const Icon =
    action.kind === "portal" ? ExternalLink : action.kind === "pack" ? Package : CreditCard;
  return (
    <Button
      {...props}
      loading={pending}
      onClick={() =>
        start(async () => {
          const res =
            action.kind === "subscribe"
              ? await startSubscriptionCheckout(locale)
              : action.kind === "portal"
                ? await openCustomerPortal(locale)
                : await startPackCheckout(locale, action.slug);
          if (!res.ok)
            return void toast.error(
              t.has(res.error as "generic") ? t(res.error as "generic") : t("generic"),
            );
          window.location.assign(res.data.url);
        })
      }
    >
      {pending ? null : <Icon />} {children}
    </Button>
  );
}
