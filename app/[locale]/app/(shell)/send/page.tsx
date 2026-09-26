import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SendWizard } from "@/components/send/send-wizard";
import { requireUser } from "@/lib/auth/session";
import { loadWizardData } from "@/lib/envelopes/wizard-data";
import { resolveLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/send">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "send" });
  return { title: t("metaTitle") };
}

export default async function NewEnvelopePage({ params }: PageProps<"/[locale]/app/send">) {
  const locale = await resolveLocale(params);
  const user = await requireUser(locale);
  const data = await loadWizardData(await createClient(), user.id);
  if (!data) return null;
  return (
    <SendWizard
      initialEnvelopeId={null}
      initialDocuments={[]}
      initialSettings={data.settings}
      contacts={data.contacts}
      credits={data.credits}
      docxEnabled={data.docxEnabled}
      smsAvailable={data.smsAvailable}
      smsBalance={data.smsBalance}
    />
  );
}
