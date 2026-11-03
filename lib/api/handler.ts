import "server-only";
import type { NextResponse } from "next/server";
import { type ApiContext, authenticate } from "./auth";
import { ApiError, errorResponse, newRequestId } from "./http";

type Params = Record<string, string>;

/**
 * Wraps a v1 route: authenticates the key, runs the handler and renders errors uniformly.
 * Responses carry `X-Request-Id` and the rate-limit headers.
 */
export function apiRoute<P extends Params = Params>(
  handler: (ctx: ApiContext, request: Request, params: P) => Promise<NextResponse>,
) {
  return async (request: Request, context: { params: Promise<P> }) => {
    const requestId = newRequestId();
    try {
      const ctx = await authenticate(request);
      const res = await handler(ctx, request, await context.params);
      res.headers.set("X-Request-Id", requestId);
      for (const [k, v] of Object.entries(ctx.rateHeaders)) res.headers.set(k, v);
      return res;
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e, requestId);
      console.error(`[api] ${request.method} ${new URL(request.url).pathname} ${requestId}`, e);
      return errorResponse(
        new ApiError(500, "internal_error", "Something went wrong on our side. Try again later."),
        requestId,
      );
    }
  };
}
