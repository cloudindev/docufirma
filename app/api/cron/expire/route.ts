import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { runExpirations } from "@/lib/cron/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runExpirations());
}
