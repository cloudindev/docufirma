import { cookies } from "next/headers";
import { AppShell } from "@/components/app/app-shell";
import { requireProfile } from "@/lib/auth/session";
import { EMPTY_CREDITS, getCredits } from "@/lib/credits";
import { redirect } from "@/lib/i18n/navigation";
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

  return (
    <AppShell
      initialCollapsed={collapsed}
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
