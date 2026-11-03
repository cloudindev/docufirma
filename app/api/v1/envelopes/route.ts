import { createEnvelope, listEnvelopes } from "@/lib/api/envelopes";
import { apiRoute } from "@/lib/api/handler";
import { json, readJson, validationError } from "@/lib/api/http";
import { createEnvelopeIn, listQuery } from "@/lib/api/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/v1/envelopes?status=&limit=&starting_after= */
export const GET = apiRoute(async (ctx, request) => {
  const q = listQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) throw validationError(q.error);
  return json(await listEnvelopes(ctx, q.data));
});

/** POST /api/v1/envelopes — creates a draft (optionally with inline documents and sent at once). */
export const POST = apiRoute(async (ctx, request) => {
  const body = createEnvelopeIn.safeParse(await readJson(request));
  if (!body.success) throw validationError(body.error);
  return json(await createEnvelope(ctx, body.data), 201);
});
