import { FileQuestion } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("errors.notFound");
  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center gap-4 py-24 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-bg-tint text-primary">
        <FileQuestion className="size-7" strokeWidth={1.75} aria-hidden />
      </span>
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-3xl sm:text-4xl">{t("title")}</h1>
      <p className="max-w-md text-ink-muted">{t("description")}</p>
      <Button asChild className="mt-2">
        <Link href="/">{t("cta")}</Link>
      </Button>
    </main>
  );
}
