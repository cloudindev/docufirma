import { envelopeEvents } from "@/lib/api/envelopes";
import { apiRoute } from "@/lib/api/handler";
import { json } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/v1/envelopes/{id}/events — audit trail. */
export const GET = apiRoute<{ id: string }>(async (ctx, _req, { id }) =>
  json(await envelopeEvents(ctx, id)),
);
