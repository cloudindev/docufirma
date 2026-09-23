import * as React from "react";
import { cn } from "@/lib/utils";
import { inputClasses } from "./input";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(inputClasses, "h-auto min-h-24 resize-y py-2.5", className)}
      {...props}
    />
  );
}
