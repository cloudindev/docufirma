import type * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

/** Label + control + hint/error wrapper used by all forms. */
export function FormField({
  id,
  label,
  hint,
  error,
  className,
  children,
  optionalLabel,
  labelAction,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
  optionalLabel?: string;
  /** Rendered next to the label but outside of it (e.g. "Forgot password?" link). */
  labelAction?: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="flex items-center gap-1.5">
          {label}
          {optionalLabel ? (
            <span className="text-xs font-normal text-ink-muted">({optionalLabel})</span>
          ) : null}
        </Label>
        {labelAction}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
