"use client";

import { Check, Globe } from "lucide-react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { type Locale, locales } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const [pending, start] = useTransition();

  const change = (next: Locale) =>
    start(() => {
      router.replace(
        // @ts-expect-error -- params always match the current pathname
        { pathname, params },
        { locale: next, scroll: false },
      );
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-1.5", className)}
          disabled={pending}
          aria-label={t("language")}
        >
          <Globe className="size-4" strokeWidth={1.75} />
          {compact ? locale.toUpperCase() : t(`languages.${locale}`)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((l) => (
          <DropdownMenuItem key={l} onSelect={() => change(l)} lang={l}>
            <span className="flex-1">{t(`languages.${l}`)}</span>
            {l === locale ? <Check className="!text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
