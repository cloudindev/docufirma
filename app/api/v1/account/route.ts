import { account } from "@/lib/api/envelopes";
import { apiRoute } from "@/lib/api/handler";
import { json } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/v1/account — plan, signatures and SMS available. */
export const GET = apiRoute(async (ctx) => json(await account(ctx)));
