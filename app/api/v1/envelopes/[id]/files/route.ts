import { envelopeFiles } from "@/lib/api/envelopes";
import { apiRoute } from "@/lib/api/handler";
import { json } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/v1/envelopes/{id}/files — short-lived download URLs (signed PDFs once completed). */
export const GET = apiRoute<{ id: string }>(async (ctx, _req, { id }) =>
  json(await envelopeFiles(ctx, id)),
);
