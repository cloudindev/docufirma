import "server-only";
import type { AdminSupabase } from "@/lib/supabase/admin";
import type { Enums, Json } from "@/types/database";

export type EventType = Enums<"envelope_event_type">;

/**
 * Appends an audit event (append-only table). SQL arguments without defaults are typed as
 * non-nullable by the Supabase generator, but NULL is valid for signer / ip / user agent.
 */
export async function logEvent(
  admin: AdminSupabase,
  e: {
    envelopeId: string;
    signerId?: string | null;
    type: EventType;
    metadata?: Json;
    ip?: string | null;
    userAgent?: string | null;
  },
) {
  const { error } = await admin.rpc("log_envelope_event", {
    p_envelope_id: e.envelopeId,
    p_signer_id: (e.signerId ?? null) as string,
    p_type: e.type,
    p_metadata: e.metadata ?? {},
    p_ip: e.ip ?? undefined,
    p_user_agent: e.userAgent ?? undefined,
  });
  if (error) console.error("[events] failed to log", e.type, error.message);
}
