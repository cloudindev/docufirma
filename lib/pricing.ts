import "server-only";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_PACKS, DEFAULT_SMS_PACKS, PLAN } from "@/lib/config";
import type { Database } from "@/types/database";

export type PackOffer = {
  slug: string;
  credits: number;
  priceCents: number;
  nameEs: string;
  nameEn: string;
};

type PackKind = "signatures" | "sms";

async function loadPacks(kind: PackKind): Promise<PackOffer[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from("credit_packs")
      .select("slug, credits, price_cents, name_es, name_en")
      .eq("active", true)
      .eq("kind", kind)
      .order("sort_order");
    if (error || !data || data.length === 0) return null;
    return data.map((p) => ({
      slug: p.slug,
      credits: p.credits,
      priceCents: p.price_cents,
      nameEs: p.name_es,
      nameEn: p.name_en,
    }));
  } catch {
    return null;
  }
}

/**
 * Active signature packs from the DB catalog (source of truth, synced with Stripe by
 * `pnpm stripe:setup`). Falls back to the defaults if the DB is unreachable (e.g. static build
 * without credentials).
 */
export async function getPackOffers(): Promise<PackOffer[]> {
  return (
    (await loadPacks("signatures")) ??
    DEFAULT_PACKS.map((p) => ({
      slug: p.slug,
      credits: p.credits,
      priceCents: p.priceCents,
      nameEs: `Pack ${p.credits} firmas`,
      nameEn: `${p.credits} signatures pack`,
    }))
  );
}

/** Active SMS packs (codes sent to signers), with the same fallback as signature packs. */
export async function getSmsPackOffers(): Promise<PackOffer[]> {
  return (
    (await loadPacks("sms")) ??
    DEFAULT_SMS_PACKS.map((p) => ({
      slug: p.slug,
      credits: p.credits,
      priceCents: p.priceCents,
      nameEs: `Pack ${p.credits} SMS`,
      nameEn: `${p.credits} SMS pack`,
    }))
  );
}

export const planOffer = {
  priceCents: PLAN.monthlyPriceCents,
  credits: PLAN.monthlyCredits,
};

export function trialCredits() {
  const value = Number(process.env.TRIAL_CREDITS ?? 3);
  return Number.isFinite(value) && value >= 0 ? value : 3;
}
