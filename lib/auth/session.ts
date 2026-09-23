import "server-only";
import { cache } from "react";
import { redirect } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type SessionUser = { id: string; email: string; emailVerified: boolean };

/** Verified current user (JWT validated through Supabase Auth), memoised per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    emailVerified: Boolean(data.user.email_confirmed_at),
  };
});

export const getProfile = cache(async (): Promise<Tables<"profiles"> | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data;
});

/** Redirects to the login page when there is no session. */
export async function requireUser(locale: Locale): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect({ href: "/login", locale });
    throw new Error("unreachable");
  }
  return user;
}

export async function requireProfile(locale: Locale): Promise<Tables<"profiles">> {
  await requireUser(locale);
  const profile = await getProfile();
  if (!profile) {
    redirect({ href: "/login", locale });
    throw new Error("unreachable");
  }
  return profile;
}
