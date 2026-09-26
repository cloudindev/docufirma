"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteDraft } from "@/app/[locale]/app/(shell)/envelopes/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { useRouter } from "@/lib/i18n/navigation";

/** Outlined "delete draft" button for the send wizard, with confirmation. */
export function DeleteDraftButton({ envelopeId }: { envelopeId: string }) {
  const t = useTranslations("app.envelope");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const remove = () =>
    start(async () => {
      const res = await deleteDraft(envelopeId);
      if (!res.ok) return void toast.error(t("toast.error"));
      toast.success(t("toast.deleted"));
      router.replace("/app/envelopes");
    });

  return (
    <>
      <Button
        type="button"
        variant="danger-outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        <Trash2 /> {t("actions.deleteDraft")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("confirm.deleteTitle")}
        description={t("confirm.deleteBody")}
        confirmLabel={t("confirm.deleteConfirm")}
        cancelLabel={t("confirm.keep")}
        onConfirm={remove}
        pending={pending}
        destructive
      />
    </>
  );
}
