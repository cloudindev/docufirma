"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, fail, ok, zodFieldErrors } from "@/lib/actions/result";
import { getSessionUser } from "@/lib/auth/session";
import { contactSchema } from "@/lib/contacts/schemas";
import { createClient } from "@/lib/supabase/server";

export async function saveContact(raw: unknown, id?: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized");
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
  const row = {
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
    email: parsed.data.email,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("contacts").update(row).eq("id", z.uuid().parse(id))
    : await supabase.from("contacts").insert(row);
  if (error) return fail(error.code === "23505" ? "duplicate" : "generic");
  revalidatePath("/[locale]/app/contacts", "page");
  return ok();
}

export async function deleteContact(id: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || !z.uuid().safeParse(id).success) return fail("unauthorized");
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) return fail("generic");
  revalidatePath("/[locale]/app/contacts", "page");
  return ok();
}
