import { requireProfile } from "@/lib/auth/session";
import { redirect } from "@/lib/i18n/navigation";
import { resolveLocale } from "@/lib/i18n/server";

/** Authenticated shell. Users that have not finished onboarding are sent there first. */
export default async function ShellLayout({ children, params }: LayoutProps<"/[locale]/app">) {
  const locale = await resolveLocale(params);
  const profile = await requireProfile(locale);
  if (!profile.onboarding_completed) redirect({ href: "/app/onboarding", locale });
  return <div className="min-h-dvh bg-bg-soft">{children}</div>;
}
