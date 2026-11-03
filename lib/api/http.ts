import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { z } from "zod";

/** Error thrown inside API handlers; rendered as `{ error: { code, message, details } }`. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found.`);

export function validationError(error: z.ZodError) {
  return new ApiError(
    422,
    "validation_error",
    "The request body or parameters are not valid.",
    error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
  );
}

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers });
}

export function errorResponse(e: ApiError, requestId: string) {
  return NextResponse.json(
    { error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } },
    { status: e.status, headers: { ...e.headers, "X-Request-Id": requestId } },
  );
}

export const newRequestId = () => `req_${randomUUID().replace(/-/g, "")}`;

/** Parses a JSON body (empty body → `{}`); malformed JSON → 400. */
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "The request body is not valid JSON.");
  }
}
