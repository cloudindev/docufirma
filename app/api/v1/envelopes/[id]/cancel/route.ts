import { cancelEnvelope } from "@/lib/api/envelopes";
import { apiRoute } from "@/lib/api/handler";
import { json } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/v1/envelopes/{id}/cancel — cancels a sent envelope and returns its reserved signatures. */
export const POST = apiRoute<{ id: string }>(async (ctx, _req, { id }) =>
  json(await cancelEnvelope(ctx, id)),
);
