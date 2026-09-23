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
        <div className="grid gap-3 sm:grid-cols-2">
          <Button asChild size="lg">
            <Link href={{ pathname: "/app/billing", query: { intent: "subscribe" } }}>
              <CreditCard /> {t("subscribe")}
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href={{ pathname: "/app/billing", query: { intent: "pack" } }}>
              <Package /> {t("buyPack")}
            </Link>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("later")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
