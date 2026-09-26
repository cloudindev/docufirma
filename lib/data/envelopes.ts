import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

export type EnvelopeStatus = Enums<"envelope_status">;
export const ENVELOPE_STATUSES: EnvelopeStatus[] = [
  "draft",
  "sent",
  "viewed",
  "completed",
  "declined",
  "expired",
  "canceled",
];

export function isEnvelopeStatus(value: unknown): value is EnvelopeStatus {
  return typeof value === "string" && (ENVELOPE_STATUSES as string[]).includes(value);
}

export const PAGE_SIZE = 15;

export type EnvelopeListItem = {
  id: string;
  title: string;
  status: EnvelopeStatus;
  finalizing: boolean;
  updatedAt: string;
  sentAt: string | null;
  documents: number;
  signers: { name: string; email: string; status: Enums<"signer_status"> }[];
};

/** Lists the current user's envelopes (RLS-scoped client). */
export async function listEnvelopes(
  supabase: ServerSupabase,
  opts: { status?: EnvelopeStatus; q?: string; page?: number; pageSize?: number },
) {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, opts.page ?? 1);
  let query = supabase
    .from("envelopes")
    .select(
      "id, title, status, all_signed_at, updated_at, sent_at, documents(count), signers(first_name, last_name, email, status, order_index)",
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (opts.status) query = query.eq("status", opts.status);
  const q = opts.q?.trim();
  if (q) {
    const safe = q.replace(/[%_,()]/g, " ").slice(0, 80);
    const code = safe.toUpperCase();
    query = /^DF-/.test(code)
      ? query.ilike("verification_code", `${code}%`)
      : query.or(`title.ilike.%${safe}%,verification_code.ilike.%${code}%`);
  }

  const { data, count, error } = await query;
  if (error) throw error;
  const items: EnvelopeListItem[] = (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    status: e.status,
    finalizing: Boolean(e.all_signed_at) && e.status !== "completed",
    updatedAt: e.updated_at,
    sentAt: e.sent_at,
    documents: (e.documents as unknown as { count: number }[])[0]?.count ?? 0,
    signers: [...e.signers]
      .sort((a, b) => a.order_index - b.order_index)
      .map((s) => ({ name: `${s.first_name} ${s.last_name}`, email: s.email, status: s.status })),
  }));
  return { items, total: count ?? 0, page, pageSize };
}

export async function getDashboardStats(supabase: ServerSupabase) {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const [pending, signed] = await Promise.all([
    supabase
      .from("envelopes")
      .select("id", { count: "exact", head: true })
      .in("status", ["sent", "viewed"]),
    supabase
      .from("envelopes")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("completed_at", startOfMonth.toISOString()),
  ]);
  return { pending: pending.count ?? 0, signedThisMonth: signed.count ?? 0 };
}

/** Full envelope detail for its owner (RLS-scoped). */
export async function getEnvelopeDetail(supabase: ServerSupabase, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data: envelope } = await supabase
    .from("envelopes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!envelope) return null;
  const [documents, signers, signed, events] = await Promise.all([
    supabase.from("documents").select("*").eq("envelope_id", id).order("order_index"),
    supabase
      .from("signers")
      .select(
        "id, first_name, last_name, email, order_index, status, sent_at, viewed_at, signed_at, declined_at, decline_reason, reminder_count, last_reminder_at, delivery, phone, require_sms_otp",
      )
      .eq("envelope_id", id)
      .order("order_index"),
    supabase.from("signed_documents").select("*").eq("envelope_id", id),
    supabase
      .from("envelope_events")
      .select("*")
      .eq("envelope_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  return {
    envelope,
    documents: documents.data ?? [],
    signers: signers.data ?? [],
    signed: signed.data ?? [],
    events: events.data ?? [],
  };
}

export type EnvelopeDetail = NonNullable<Awaited<ReturnType<typeof getEnvelopeDetail>>>;
