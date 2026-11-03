import { sendEnvelope } from "@/lib/api/envelopes";
import { apiRoute } from "@/lib/api/handler";
import { json } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/v1/envelopes/{id}/send — sends the draft (reserves signatures, emails the signers). */
export const POST = apiRoute<{ id: string }>(async (ctx, _req, { id }) =>
  json(await sendEnvelope(ctx, id)),
);
