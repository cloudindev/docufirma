import { createUpload } from "@/lib/api/envelopes";
import { apiRoute } from "@/lib/api/handler";
import { json, readJson, validationError } from "@/lib/api/http";
import { uploadIn } from "@/lib/api/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/v1/envelopes/{id}/uploads — signed URL to PUT a large file (up to 25 MB). */
export const POST = apiRoute<{ id: string }>(async (ctx, request, { id }) => {
  const body = uploadIn.safeParse(await readJson(request));
  if (!body.success) throw validationError(body.error);
  return json(await createUpload(ctx, id, body.data.name), 201);
});
