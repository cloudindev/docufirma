import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  DeleteAccount,
  LogoForm,
  PasswordForm,
  PreferencesForm,
  ProfileForm,
} from "@/components/app/settings-forms";
import { type AutoRechargeState, AutoRechargeCard } from "@/components/app/auto-recharge-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireProfile } from "@/lib/auth/session";
import { brandingLogoUrl } from "@/lib/email";
import { resolveLocale } from "@/lib/i18n/server";
import { getPackOffers, getSmsPackOffers } from "@/lib/pricing";
import { savedCard } from "@/lib/stripe/auto-recharge";
import { getStripe } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/settings">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "app.settings" });
  return { title: t("metaTitle") };
}

export default async function SettingsPage({ params }: PageProps<"/[locale]/app/settings">) {
  const locale = await resolveLocale(params);
  const profile = await requireProfile(locale);
  const t = await getTranslations({ locale, namespace: "app.settings" });
  const logo = brandingLogoUrl(profile.id, profile.logo_path);
  const supabase = await createClient();
  const stripe = getStripe();
  const [signaturePacks, smsPacks, { data: rows }, { data: catalog }, card] = await Promise.all([
    getPackOffers(),
    getSmsPackOffers(),
    supabase.from("auto_recharge").select("*"),
    supabase.from("credit_packs").select("id, slug"),
    stripe && profile.stripe_customer_id
      ? savedCard(stripe, profile.stripe_customer_id).catch(() => null)
      : Promise.resolve(null),
  ]);
  const slugById = new Map((catalog ?? []).map((p) => [p.id, p.slug]));
  const stateFor = (kind: "signatures" | "sms", fallbackPack: string): AutoRechargeState => {
    const row = rows?.find((r) => r.kind === kind);
    return {
      enabled: row?.enabled ?? false,
      threshold: row?.threshold ?? (kind === "sms" ? 10 : 2),
      packSlug: (row?.pack_id && slugById.get(row.pack_id)) || fallbackPack,
      lastSuccessAt: row?.last_success_at ?? null,
      lastError: row?.last_error ?? null,
    };
  };
  const toPack = (p: { slug: string; credits: number; priceCents: number }) => ({
    slug: p.slug,
    credits: p.credits,
    priceCents: p.priceCents,
  });
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid max-w-3xl gap-6">
        <ProfileForm
          email={profile.email}
          defaults={{
            firstName: profile.first_name ?? "",
            lastName: profile.last_name ?? "",
            companyName: profile.company_name ?? "",
            taxId: profile.tax_id ?? "",
          }}
        />
        <LogoForm logoUrl={logo ? `/api/branding/${profile.id}` : null} />
        <PreferencesForm
          defaults={{
            locale: profile.locale === "en" ? "en" : "es",
            notifyOnView: profile.notify_on_view,
            notifyOnComplete: profile.notify_on_complete,
          }}
        />
        <AutoRechargeCard
          signaturePacks={signaturePacks.map(toPack)}
          smsPacks={smsPacks.map(toPack)}
          signatures={stateFor("signatures", signaturePacks[0]?.slug ?? "")}
          sms={stateFor("sms", smsPacks[0]?.slug ?? "")}
          card={
            card
              ? {
                  brand: card.brand,
                  last4: card.last4,
                  expMonth: card.expMonth,
                  expYear: card.expYear,
                }
              : null
          }
          hasCustomer={Boolean(stripe && profile.stripe_customer_id)}
        />
        <PasswordForm />
        <DeleteAccount email={profile.email} />
      </div>
    </>
  );
}
