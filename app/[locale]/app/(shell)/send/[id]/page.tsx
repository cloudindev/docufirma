import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SendWizard } from "@/components/send/send-wizard";
import { requireUser } from "@/lib/auth/session";
import { loadWizardData } from "@/lib/envelopes/wizard-data";
import { redirect } from "@/lib/i18n/navigation";
import { resolveLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/send/[id]">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "send" });
  return { title: t("metaTitle") };
}

export default async function EditDraftPage({ params }: PageProps<"/[locale]/app/send/[id]">) {
  const { id } = await params;
  const locale = await resolveLocale(params);
  const user = await requireUser(locale);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await loadWizardData(await createClient(), user.id, id);
  if (!data) notFound();
  if (data.status !== "draft")
    redirect({ href: { pathname: "/app/envelopes/[id]", params: { id } }, locale });
  return (
    <SendWizard
      key={id}
      initialEnvelopeId={id}
      initialDocuments={data.documents}
      initialSettings={data.settings}
      contacts={data.contacts}
      credits={data.credits}
      docxEnabled={data.docxEnabled}
      smsAvailable={data.smsAvailable}
      smsBalance={data.smsBalance}
    />
  );
}
