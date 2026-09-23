"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { Enums } from "@/types/database";

type Status = Enums<"envelope_status">;
type SignerStatus = Enums<"signer_status">;

const ENVELOPE_VARIANT: Record<Status, "default" | "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  sent: "default",
  viewed: "warning",
  completed: "success",
  declined: "danger",
  expired: "neutral",
  canceled: "neutral",
};

const SIGNER_VARIANT: Record<
  SignerStatus,
  "default" | "neutral" | "success" | "warning" | "danger"
> = {
  pending: "neutral",
  sent: "default",
  viewed: "warning",
  signed: "success",
  declined: "danger",
};

export function EnvelopeStatusBadge({
  status,
  finalizing = false,
}: {
  status: Status;
  finalizing?: boolean;
}) {
  const t = useTranslations("app.status");
  if (finalizing) {
    return (
      <Badge variant="success" dot>
        {t("finalizing")}
      </Badge>
    );
  }
  return (
    <Badge variant={ENVELOPE_VARIANT[status]} dot>
      {t(status)}
    </Badge>
  );
}

export function SignerStatusBadge({ status }: { status: SignerStatus }) {
  const t = useTranslations("app.signerStatus");
  return (
    <Badge variant={SIGNER_VARIANT[status]} dot>
      {t(status)}
    </Badge>
  );
}
