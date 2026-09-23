import { NextResponse } from "next/server";
import { processCloseJobs, processTsaRetries } from "@/lib/closure/close-envelope";
import { isAuthorizedCron } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Processes pending envelope closures (crash recovery) and due timestamp retries. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const closes = await processCloseJobs();
  const tsa = await processTsaRetries();
  return NextResponse.json({ closes, tsa });
}
