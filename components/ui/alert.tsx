import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-3 rounded-xl border px-4 py-3 text-sm", {
  variants: {
    variant: {
      info: "border-primary/20 bg-bg-tint text-ink",
      success: "border-success/25 bg-success/5 text-ink",
      warning: "border-warning/30 bg-warning/8 text-ink",
      danger: "border-danger/25 bg-danger/5 text-ink",
    },
  },
  defaultVariants: { variant: "info" },
});

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };
const iconColors = {
  info: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export function Alert({
  variant,
  title,
  children,
  action,
  className,
}: VariantProps<typeof alertVariants> & {
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const v = variant ?? "info";
  const Icon = icons[v];
  return (
    <div
      role={v === "danger" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconColors[v])} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-ink-muted">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
