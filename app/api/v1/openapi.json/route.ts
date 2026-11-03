import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/api/openapi";
import { appUrl } from "@/lib/env-public";

/** Public OpenAPI description (no key needed). */
export function GET() {
  return NextResponse.json(openApiSpec(appUrl()), {
    headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
}
