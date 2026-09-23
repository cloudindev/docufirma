import "server-only";
import type { WizardContact, WizardDocument } from "@/components/send/types";
import { getCredits } from "@/lib/credits";
import type { EnvelopeSettingsInput } from "@/lib/envelopes/schemas";
import { isDocxConversionEnabled } from "@/lib/pdf/convert";
import type { ServerSupabase } from "@/lib/supabase/server";

export async function loadWizardData(
  supabase: ServerSupabase,
  userId: string,
  envelopeId?: string,
) {
  const [{ data: contacts }, credits, { data: profile }] = await Promise.all([
    supabase
      .from("contacts")
      .select("first_name, last_name, email")
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .limit(500),
    getCredits(supabase, userId),
    supabase.from("profiles").select("locale").eq("id", userId).single(),
  ]);

  let documents: WizardDocument[] = [];
  let settings: EnvelopeSettingsInput = {
    title: "",
    message: "",
    sequential: false,
    locale: profile?.locale === "en" ? "en" : "es",
    expiryDays: 30,
    reminderDays: 3,
    signers: [],
  };
  let status: string | null = null;

  if (envelopeId) {
    const { data: envelope } = await supabase
      .from("envelopes")
      .select("id, status, title, message, sequential, locale, expiry_days, reminder_days")
      .eq("id", envelopeId)
      .maybeSingle();
    if (!envelope) return null;
    status = envelope.status;
    const [{ data: docs }, { data: signers }] = await Promise.all([
      supabase
        .from("documents")
        .select("id, name, page_count, size_bytes")
        .eq("envelope_id", envelopeId)
        .order("order_index"),
      supabase
        .from("signers")
        .select("first_name, last_name, email")
        .eq("envelope_id", envelopeId)
        .order("order_index"),
    ]);
    documents = (docs ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      pageCount: d.page_count,
      sizeBytes: d.size_bytes,
    }));
    settings = {
      title: envelope.title,
      message: envelope.message ?? "",
      sequential: envelope.sequential,
      locale: envelope.locale === "en" ? "en" : "es",
      expiryDays: envelope.expiry_days,
      reminderDays: envelope.reminder_days,
      signers: (signers ?? []).map((s) => ({
        firstName: s.first_name,
        lastName: s.last_name,
        email: s.email,
      })),
    };
  }

  return {
    status,
    documents,
    settings,
    contacts: (contacts ?? []) as WizardContact[],
    credits: credits.total,
    docxEnabled: isDocxConversionEnabled(),
  };
}
