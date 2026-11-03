import { remindEnvelope } from "@/lib/api/envelopes";
import { apiRoute } from "@/lib/api/handler";
import { json } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/v1/envelopes/{id}/remind — emails pending signers again (at most once per hour each). */
export const POST = apiRoute<{ id: string }>(async (ctx, _req, { id }) =>
  json(await remindEnvelope(ctx, id)),
);
