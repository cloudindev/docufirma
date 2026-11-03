/** Events sent to customer webhooks (no server-only deps: also used by docs and OpenAPI). */
export const WEBHOOK_EVENTS = [
  "envelope.sent",
  "envelope.signed",
  "envelope.completed",
  "envelope.declined",
  "envelope.expired",
  "envelope.canceled",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];
