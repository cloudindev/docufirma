import { addInlineDocument } from "@/lib/api/envelopes";
import { apiRoute } from "@/lib/api/handler";
import { json, readJson, validationError } from "@/lib/api/http";
import { documentIn } from "@/lib/api/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/v1/envelopes/{id}/documents — inline document (base64, up to 3 MB). */
export const POST = apiRoute<{ id: string }>(async (ctx, request, { id }) => {
  const body = documentIn.safeParse(await readJson(request));
  if (!body.success) throw validationError(body.error);
  return json(await addInlineDocument(ctx, id, body.data), 201);
});
