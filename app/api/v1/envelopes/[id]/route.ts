import { deleteEnvelope, envelopeDetail, updateEnvelope } from "@/lib/api/envelopes";
import { apiRoute } from "@/lib/api/handler";
import { json, readJson, validationError } from "@/lib/api/http";
import { updateEnvelopeIn } from "@/lib/api/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type P = { id: string };

export const GET = apiRoute<P>(async (ctx, _req, { id }) => json(await envelopeDetail(ctx, id)));

/** PATCH /api/v1/envelopes/{id} — drafts only; `signers` replaces the whole list. */
export const PATCH = apiRoute<P>(async (ctx, request, { id }) => {
  const body = updateEnvelopeIn.safeParse(await readJson(request));
  if (!body.success) throw validationError(body.error);
  return json(await updateEnvelope(ctx, id, body.data));
});

/** DELETE /api/v1/envelopes/{id} — drafts only. */
export const DELETE = apiRoute<P>(async (ctx, _req, { id }) => json(await deleteEnvelope(ctx, id)));
