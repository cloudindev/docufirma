import { inPersonUrl } from "@/lib/api/envelopes";
import { apiRoute } from "@/lib/api/handler";
import { json } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/v1/envelopes/{id}/signers/{signerId}/signing-url — in-person signers only. */
export const POST = apiRoute<{ id: string; signerId: string }>(
  async (ctx, _req, { id, signerId }) => json(await inPersonUrl(ctx, id, signerId), 201),
);
