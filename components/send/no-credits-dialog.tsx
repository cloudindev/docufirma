"use client";

import { CreditCard, Package } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "@/lib/i18n/navigation";

export function NoCreditsDialog({
  open,
  onOpenChange,
  cost,
  available,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cost: number;
  available: number;
}) {
  const t = useTranslations("send.noCredits");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body", { cost, available })}</DialogDescription>
        </DialogHeader>
        <Button asChild size="lg">
          <Link href={{ pathname: "/app/billing", query: { intent: "pack" } }}>
            <Package /> {t("buyPack")}
          </Link>
        </Button>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("later")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Sending requires the Pro plan (D-039). */
export function NoPlanDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("send.noPlan");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>
        <Button asChild size="lg">
          <Link href={{ pathname: "/app/billing", query: { intent: "subscribe" } }}>
            <CreditCard /> {t("subscribe")}
          </Link>
        </Button>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("later")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
