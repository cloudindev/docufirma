import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClasses =
  "flex h-11 w-full min-w-0 rounded-xl border border-border bg-bg px-3.5 text-base text-ink shadow-[0_1px_2px_rgba(11,27,63,0.03)] transition-[border-color,box-shadow] outline-none placeholder:text-ink-muted/70 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary-soft disabled:cursor-not-allowed disabled:bg-bg-soft disabled:opacity-70 aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/15 sm:text-sm";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(inputClasses, className)} {...props} />;
}
