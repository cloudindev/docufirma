import { EmailBox, EmailButton, EmailHeading, EmailLayout, EmailText } from "./components/layout";
import { type EmailLocale, emailTranslator } from "./i18n";

/** Sender notifications: viewed, declined, expired. */
export type EnvelopeNoticeProps = {
  locale: EmailLocale;
  appUrl: string;
  kind: "viewed" | "declined" | "expired";
  title: string;
  signerName?: string;
  signerEmail?: string;
  reason?: string | null;
  envelopeUrl: string;
};

export function envelopeNoticeSubject(p: EnvelopeNoticeProps) {
  const t = emailTranslator(p.locale);
  if (p.kind === "viewed")
    return t("viewed.subject", { signer: p.signerName ?? "", title: p.title });
  if (p.kind === "declined")
    return t("declined.subject", { signer: p.signerName ?? "", title: p.title });
  return t("expired.subject", { title: p.title });
}

export default function EnvelopeNotice(p: EnvelopeNoticeProps) {
  const t = emailTranslator(p.locale);
  const vars = { signer: p.signerName ?? "", email: p.signerEmail ?? "", title: p.title };
  return (
    <EmailLayout
      lang={p.locale}
      preview={t(`${p.kind}.preview`)}
      appUrl={p.appUrl}
      footer={t("common.footer")}
    >
      <EmailHeading>{t(`${p.kind}.heading`)}</EmailHeading>
      <EmailText>{t(`${p.kind}.body`, vars)}</EmailText>
      {p.kind === "declined" && p.reason ? (
        <EmailBox>
          <EmailText>{t("declined.reason", { reason: p.reason })}</EmailText>
        </EmailBox>
      ) : null}
      <EmailButton href={p.envelopeUrl}>{t(`${p.kind}.cta`)}</EmailButton>
    </EmailLayout>
  );
}

EnvelopeNotice.PreviewProps = {
  locale: "es",
  appUrl: "http://localhost:3000",
  kind: "declined",
  title: "Contrato de servicios 2026",
  signerName: "Lucía Gómez",
  signerEmail: "lucia@example.com",
  reason: "Falta la cláusula de confidencialidad.",
  envelopeUrl: "http://localhost:3000/es/app/envelopes/1",
} satisfies EnvelopeNoticeProps;
