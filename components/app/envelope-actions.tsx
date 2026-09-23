"use client";

import { Copy, Download, MoreHorizontal, PencilLine, Trash2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  cancelEnvelope,
  deleteDraft,
  duplicateEnvelope,
  getDownloadUrl,
} from "@/app/[locale]/app/(shell)/envelopes/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toaster";
import { Link, useRouter } from "@/lib/i18n/navigation";
import type { Enums } from "@/types/database";

export function EnvelopeActions({
  envelopeId,
  status,
  cancelable,
  extra,
}: {
  envelopeId: string;
  status: Enums<"envelope_status">;
  cancelable: boolean;
  extra?: React.ReactNode;
}) {
  const t = useTranslations("app.envelope");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);

  const run = (action: "cancel" | "delete" | "duplicate") =>
    start(async () => {
      if (action === "cancel") {
        const res = await cancelEnvelope(envelopeId);
        if (!res.ok) return void toast.error(t("toast.error"));
        toast.success(t("toast.canceled", { count: res.data.released }));
        setConfirm(null);
        router.refresh();
      } else if (action === "delete") {
        const res = await deleteDraft(envelopeId);
        if (!res.ok) return void toast.error(t("toast.error"));
        toast.success(t("toast.deleted"));
        router.replace("/app/envelopes");
      } else {
        const res = await duplicateEnvelope(envelopeId);
        if (!res.ok) return void toast.error(t("toast.error"));
        toast.success(t("toast.duplicated"));
        router.push({ pathname: "/app/send/[id]", params: { id: res.data.id } });
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" ? (
        <Button asChild>
          <Link href={{ pathname: "/app/send/[id]", params: { id: envelopeId } }}>
            <PencilLine /> {t("actions.continue")}
          </Link>
        </Button>
      ) : null}
      {extra}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" aria-label={t("actions.more")} disabled={pending}>
            <MoreHorizontal className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => run("duplicate")}>
            <Copy /> {t("actions.duplicate")}
          </DropdownMenuItem>
          {cancelable ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="danger" onSelect={() => setConfirm("cancel")}>
                <XCircle /> {t("actions.cancel")}
              </DropdownMenuItem>
            </>
          ) : null}
          {status === "draft" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="danger" onSelect={() => setConfirm("delete")}>
                <Trash2 /> {t("actions.delete")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("confirm.cancelTitle")}
        description={t("confirm.cancelBody")}
        confirmLabel={t("confirm.cancelConfirm")}
        cancelLabel={t("confirm.keep")}
        onConfirm={() => run("cancel")}
        pending={pending}
        destructive
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("confirm.deleteTitle")}
        description={t("confirm.deleteBody")}
        confirmLabel={t("confirm.deleteConfirm")}
        cancelLabel={t("confirm.keep")}
        onConfirm={() => run("delete")}
        pending={pending}
        destructive
      />
    </div>
  );
}

export function DownloadButton({
  envelopeId,
  kind,
  id,
  label,
}: {
  envelopeId: string;
  kind: "original" | "signed" | "evidence" | "tsr";
  id: string;
  label: string;
}) {
  const t = useTranslations("app.envelope");
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await getDownloadUrl({ envelopeId, kind, id });
          if (!res.ok) return void toast.error(t("toast.error"));
          window.location.assign(res.data.url);
        })
      }
    >
      {pending ? null : <Download />} {label}
    </Button>
  );
}
