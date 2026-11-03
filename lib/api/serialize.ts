import type { Tables } from "@/types/database";

type Envelope = Tables<"envelopes">;
type Signer = Pick<
  Tables<"signers">,
  | "id"
  | "first_name"
  | "last_name"
  | "email"
  | "order_index"
  | "status"
  | "delivery"
  | "phone"
  | "require_sms_otp"
  | "sent_at"
  | "viewed_at"
  | "signed_at"
  | "declined_at"
  | "decline_reason"
>;
type Document = Pick<
  Tables<"documents">,
  "id" | "name" | "page_count" | "size_bytes" | "original_sha256" | "order_index"
>;

export const SIGNER_COLUMNS =
  "id, first_name, last_name, email, order_index, status, delivery, phone, require_sms_otp, sent_at, viewed_at, signed_at, declined_at, decline_reason";
export const DOCUMENT_COLUMNS = "id, name, page_count, size_bytes, original_sha256, order_index";

export function serializeSigner(s: Signer) {
  return {
    id: s.id,
    object: "signer" as const,
    first_name: s.first_name,
    last_name: s.last_name,
    email: s.email,
    order: s.order_index,
    status: s.status,
    delivery: s.delivery,
    phone: s.phone,
    require_sms_otp: s.require_sms_otp,
    sent_at: s.sent_at,
    viewed_at: s.viewed_at,
    signed_at: s.signed_at,
    declined_at: s.declined_at,
    decline_reason: s.decline_reason,
  };
}

export function serializeDocument(d: Document) {
  return {
    id: d.id,
    object: "document" as const,
    name: d.name,
    order: d.order_index,
    page_count: d.page_count,
    size_bytes: d.size_bytes,
    sha256: d.original_sha256,
  };
}

export function serializeEnvelope(e: Envelope, signers?: Signer[], documents?: Document[]) {
  return {
    id: e.id,
    object: "envelope" as const,
    status: e.status,
    title: e.title,
    message: e.message,
    locale: e.locale,
    sequential: e.sequential,
    expiry_days: e.expiry_days,
    reminder_days: e.reminder_days,
    verification_code: e.verification_code,
    created_at: e.created_at,
    sent_at: e.sent_at,
    expires_at: e.expires_at,
    completed_at: e.completed_at,
    declined_at: e.declined_at,
    expired_at: e.expired_at,
    canceled_at: e.canceled_at,
    ...(signers ? { signers: signers.map(serializeSigner) } : {}),
    ...(documents ? { documents: documents.map(serializeDocument) } : {}),
  };
}

export type SerializedEnvelope = ReturnType<typeof serializeEnvelope>;
