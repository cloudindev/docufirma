import type es from "@/messages/es.json";

/** Type of the message catalog. `es.json` is the source of truth; `en.json` must mirror its keys. */
export type Messages = typeof es;
