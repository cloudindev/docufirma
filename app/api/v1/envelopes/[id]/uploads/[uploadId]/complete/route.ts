import { completeUpload } from "@/lib/api/envelopes";
import { apiRoute } from "@/lib/api/handler";
import { json, readJson, validationError } from "@/lib/api/http";
import { completeUploadIn } from "@/lib/api/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/v1/envelopes/{id}/uploads/{uploadId}/complete — validates and adds the file. */
export const POST = apiRoute<{ id: string; uploadId: string }>(
  async (ctx, request, { id, uploadId }) => {
    const body = completeUploadIn.safeParse(await readJson(request));
    if (!body.success) throw validationError(body.error);
    return json(await completeUpload(ctx, id, uploadId, body.data.name), 201);
  },
);
