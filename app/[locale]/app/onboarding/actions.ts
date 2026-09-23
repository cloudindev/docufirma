"use server";

import { cookies } from "next/headers";
import { type ActionResult, fail, ok, zodFieldErrors } from "@/lib/actions/result";
import { onboardingSchema } from "@/lib/auth/schemas";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function completeOnboarding(raw: unknown): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized");
  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      company_name: parsed.data.companyName || null,
      locale: parsed.data.locale,
      onboarding_completed: true,
    })
    .eq("id", user.id);
  if (error) return fail("generic");

  (await cookies()).set("NEXT_LOCALE", parsed.data.locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return ok();
}
