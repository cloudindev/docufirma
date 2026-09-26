"use client";

import { PenLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { startInPersonSigning } from "@/app/[locale]/app/(shell)/envelopes/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";

/** In-person signing: opens the signer's screen on this device (a fresh, single-signer link). */
export function SignNowButton({
  envelopeId,
  signerId,
  signerName,
}: {
  envelopeId: string;
  signerId: string;
  signerName: string;
}) {
  const t = useTranslations("app.envelope");
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      loading={pending}
      aria-label={t("actions.signNowFor", { name: signerName })}
      onClick={() =>
        start(async () => {
          const res = await startInPersonSigning(envelopeId, signerId);
          if (!res.ok) {
            toast.error(res.error === "not_your_turn" ? t("toast.notYourTurn") : t("toast.error"));
            return;
          }
          window.location.assign(res.data.url);
        })
      }
    >
      {pending ? null : <PenLine />} {t("actions.signNow")}
    </Button>
  );
}
