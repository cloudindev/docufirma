import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app/app-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/session";
import { EMPTY_CREDITS, getCredits } from "@/lib/credits";
import { Link, redirect } from "@/lib/i18n/navigation";
import { resolveLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { fullName, initials } from "@/lib/utils";

/** Authenticated shell. Users that have not finished onboarding are sent there first. */
export default async function ShellLayout({ children, params }: LayoutProps<"/[locale]/app">) {
  const locale = await resolveLocale(params);
  const profile = await requireProfile(locale);
  if (!profile.onboarding_completed) redirect({ href: "/app/onboarding", locale });

  const supabase = await createClient();
  const credits = await getCredits(supabase, profile.id).catch(() => EMPTY_CREDITS);
  const collapsed = (await cookies()).get("df_sidebar_collapsed")?.value === "1";
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const t = await getTranslations({ locale, namespace: "billing" });
  const banner =
    sub && (sub.status === "past_due" || sub.status === "unpaid") ? (
      <Alert
        variant="danger"
        className="mb-6"
        action={
          <Button asChild size="sm" variant="secondary">
            <Link href="/app/billing">{t("pastDueCta")}</Link>
          </Button>
        }
      >
        {t("pastDue")}
      </Alert>
    ) : null;

  return (
    <AppShell
      initialCollapsed={collapsed}
      banner={banner}
      user={{
        name: fullName(profile.first_name, profile.last_name) || profile.email,
        email: profile.email,
        initials: initials(profile.first_name, profile.last_name, profile.email[0]?.toUpperCase()),
        company: profile.company_name,
      }}
      credits={{
        monthly: credits.monthly,
        pack: credits.pack,
        total: credits.total,
        monthlyGranted: credits.monthlyGranted,
      }}
    >
      {children}
    </AppShell>
  );
}
