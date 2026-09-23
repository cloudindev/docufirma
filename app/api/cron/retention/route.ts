import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { runRetention } from "@/lib/cron/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GDPR retention: purges expired biometric evidence (daily). */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runRetention());
}
