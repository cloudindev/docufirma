import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContactsManager } from "@/components/app/contacts-manager";
import { PageHeader } from "@/components/ui/page-header";
import { resolveLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/contacts">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "app.contacts" });
  return { title: t("metaTitle") };
}

export default async function ContactsPage({ params }: PageProps<"/[locale]/app/contacts">) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "app.contacts" });
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, last_used_at")
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("first_name")
    .limit(1000);
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ContactsManager contacts={data ?? []} />
    </>
  );
}
