import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sendSms, smsProvider } from "@/lib/sms";
import { normalizePhone } from "@/lib/validation/phone";

export const dynamic = "force-dynamic";

/**
 * Operator diagnostic: sends one test SMS and returns the provider's raw answer.
 *   curl -X POST https://docufirma.es/api/admin/sms-test \
 *     -H "Authorization: Bearer $CRON_SECRET" -H "content-type: application/json" \
 *     -d '{"to":"600123456"}'
 * Protected by CRON_SECRET and limited to 5 messages per hour.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = z
    .object({ to: z.string().max(32), text: z.string().max(160).optional() })
    .safeParse(await request.json().catch(() => null));
  const to = body.success ? normalizePhone(body.data.to) : null;
  if (!body.success || !to) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  const { allowed } = await rateLimit("admin:sms-test", 5, 3600);
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const provider = smsProvider();
  const result = await sendSms(to, body.data.text ?? "DocuFirma: SMS de prueba.");
  return NextResponse.json({ provider, to, ...result }, { status: result.ok ? 200 : 502 });
}
