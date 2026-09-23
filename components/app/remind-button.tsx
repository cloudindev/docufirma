"use client";

import { BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { remindPendingSigners } from "@/app/[locale]/app/(shell)/envelopes/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { useRouter } from "@/lib/i18n/navigation";

export function RemindButton({ envelopeId }: { envelopeId: string }) {
  const t = useTranslations("app.envelope");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await remindPendingSigners(envelopeId);
          if (!res.ok) return void toast.error(t("toast.error"));
          toast.success(t("toast.remindedMany", { count: res.data.sent }));
          router.refresh();
        })
      }
    >
      {pending ? null : <BellRing />} {t("actions.remindAll")}
    </Button>
  );
}
