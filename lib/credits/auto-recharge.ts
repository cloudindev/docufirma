import "server-only";
import { sendAccountNotice } from "@/lib/email";
import { appUrl } from "@/lib/env-public";
import { getPathname } from "@/lib/i18n/navigation";
import { getStripe } from "@/lib/stripe/client";
import {
  type RechargeKind,
  type RechargeNotice,
  runAutoRecharge,
} from "@/lib/stripe/auto-recharge";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tops up the balance if the user enabled automatic top-up and reached their minimum.
 * Never throws: call it in `after()` once signatures or SMS have been used.
 */
export async function triggerAutoRecharge(userId: string, kind: RechargeKind) {
  const admin = createAdminClient();
  const notify = async (n: RechargeNotice) => {
    const { data: profile } = await admin
      .from("profiles")
      .select("email, locale")
      .eq("id", n.userId)
      .single();
    if (!profile) return;
    const locale = profile.locale === "en" ? "en" : "es";
    const title =
      n.packLabel.kind === "sms"
        ? `${n.packLabel.credits} SMS`
        : locale === "en"
          ? `${n.packLabel.credits} signatures`
          : `${n.packLabel.credits} firmas`;
    const amount = new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(n.amountCents / 100);
    await sendAccountNotice(profile.email, {
      locale,
      kind: n.kind,
      title,
      amount,
      ctaUrl: n.ctaUrl ?? appUrl(getPathname({ href: "/app/billing", locale })),
    });
  };
  try {
    const outcome = await runAutoRecharge({ stripe: getStripe(), admin, notify }, userId, kind);
    if (outcome.status === "failed")
      console.warn(`[auto-recharge] ${kind} for ${userId} failed: ${outcome.reason}`);
    return outcome;
  } catch (error) {
    console.error(`[auto-recharge] ${kind} for ${userId}:`, (error as Error).message);
    return { status: "failed", reason: "internal" } as const;
  }
}
