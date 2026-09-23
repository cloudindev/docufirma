"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import sharp from "sharp";
import { type ActionResult, fail, ok, zodFieldErrors } from "@/lib/actions/result";
import { authErrorKey } from "@/lib/auth/errors";
import { resetPasswordSchema } from "@/lib/auth/schemas";
import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "@/lib/i18n/navigation";
import { isLocale } from "@/lib/i18n/routing";
import {
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  preferencesSchema,
  profileSchema,
} from "@/lib/profile/schemas";
import { BUCKETS, paths } from "@/lib/storage/paths";
import { cancelSubscriptionsForDeletedAccount } from "@/lib/stripe/account";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function revalidateApp() {
  revalidatePath("/[locale]/app", "layout");
}

export async function updateProfile(raw: unknown): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized");
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      company_name: parsed.data.companyName || null,
      tax_id: parsed.data.taxId || null,
    })
    .eq("id", user.id);
  if (error) return fail("generic");
  revalidateApp();
  return ok();
}

export async function updatePreferences(raw: unknown): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized");
  const parsed = preferencesSchema.safeParse(raw);
  if (!parsed.success) return fail("validation");
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      locale: parsed.data.locale,
      notify_on_view: parsed.data.notifyOnView,
      notify_on_complete: parsed.data.notifyOnComplete,
    })
    .eq("id", user.id);
  if (error) return fail("generic");
  (await cookies()).set("NEXT_LOCALE", parsed.data.locale, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });
  revalidateApp();
  return ok();
}

/** Logo: validated, normalised to a PNG (max 480×160) and stored in the private branding bucket. */
export async function uploadLogo(formData: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized");
  const file = formData.get("logo");
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > LOGO_MAX_BYTES ||
    !LOGO_TYPES.includes(file.type)
  ) {
    return fail("invalid");
  }
  let png: Buffer;
  try {
    png = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25_000_000 })
      .rotate()
      .resize({ width: 480, height: 160, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    return fail("invalid");
  }
  const admin = createAdminClient();
  const path = paths.logo(user.id);
  const { error } = await admin.storage
    .from(BUCKETS.branding)
    .upload(path, png, { contentType: "image/png", upsert: true });
  if (error) return fail("generic");
  await admin.from("profiles").update({ logo_path: path }).eq("id", user.id);
  revalidateApp();
  return ok();
}

export async function removeLogo(): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized");
  const admin = createAdminClient();
  await admin.storage.from(BUCKETS.branding).remove([paths.logo(user.id)]);
  await admin.from("profiles").update({ logo_path: null }).eq("id", user.id);
  revalidateApp();
  return ok();
}

export async function changePassword(raw: unknown): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized");
  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(authErrorKey(error.code, error.message));
  return ok();
}

/** GDPR erasure (see docs/LEGAL.md §5 and DECISIONS D-015). */
export async function deleteAccount(
  confirmEmail: string,
  localeRaw: string,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized");
  if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) return fail("mismatch");
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  await cancelSubscriptionsForDeletedAccount(profile?.stripe_customer_id ?? null);

  const { data, error } = await admin.rpc("delete_user_account", { p_user_id: user.id });
  if (error) {
    console.error("[delete-account]", error.message);
    return fail("generic");
  }
  const files = ((data as { paths?: string[] } | null)?.paths ?? []).filter(Boolean);
  const byBucket = new Map<string, string[]>();
  for (const full of files) {
    const [bucket, ...rest] = full.split("/");
    if (!bucket || rest.length === 0) continue;
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), rest.join("/")]);
  }
  for (const [bucket, list] of byBucket) {
    for (let i = 0; i < list.length; i += 100)
      await admin.storage.from(bucket).remove(list.slice(i, i + 100));
  }

  await admin.auth.admin.deleteUser(user.id);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: "/", locale: isLocale(localeRaw) ? localeRaw : "es" });
  return ok();
}
