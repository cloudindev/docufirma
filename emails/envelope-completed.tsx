import { Link, Text } from "@react-email/components";
import {
  colors,
  EmailBox,
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./components/layout";
import { type EmailLocale, emailTranslator } from "./i18n";

export type EnvelopeCompletedProps = {
  locale: EmailLocale;
  appUrl: string;
  logoUrl?: string | null;
  audience: "sender" | "signer";
  recipientName: string;
  title: string;
  verificationCode: string;
  verifyUrl: string;
  appEnvelopeUrl?: string;
  files: { label: string; url: string }[];
  tsa: { authority: string; genTime: string; serial: string } | null;
};

export function envelopeCompletedSubject(p: Pick<EnvelopeCompletedProps, "locale" | "title">) {
  return emailTranslator(p.locale)("completed.subject", { title: p.title });
}

export default function EnvelopeCompleted(p: EnvelopeCompletedProps) {
  const t = emailTranslator(p.locale);
  return (
    <EmailLayout
      lang={p.locale}
      preview={t("completed.preview")}
      logoUrl={p.logoUrl}
      appUrl={p.appUrl}
      footer={t("common.footer")}
    >
      <EmailHeading>✅ {t("completed.heading")}</EmailHeading>
      <EmailText>
        {p.audience === "sender"
          ? t("completed.bodySender", { title: p.title })
          : t("completed.bodySigner", { title: p.title, name: p.recipientName })}
      </EmailText>
      <EmailBox>
        <Text style={{ fontSize: 13, color: colors.muted, margin: "0 0 8px" }}>
          {t("completed.downloads")}
        </Text>
        {p.files.map((f) => (
          <Text key={f.url} style={{ fontSize: 15, margin: "4px 0" }}>
            <Link href={f.url} style={{ color: colors.primary, fontWeight: 500 }}>
              ⬇ {f.label}
            </Link>
          </Text>
        ))}
      </EmailBox>
      <EmailText muted small>
        {t("common.verificationCode", { code: p.verificationCode })}
        {!p.tsa && (
          <>
            <br />
            {t("completed.tsaPending")}
          </>
        )}
      </EmailText>
      <EmailButton
        href={p.audience === "sender" && p.appEnvelopeUrl ? p.appEnvelopeUrl : p.verifyUrl}
      >
        {p.audience === "sender" ? t("completed.cta") : t("completed.verify")}
      </EmailButton>
    </EmailLayout>
  );
}

EnvelopeCompleted.PreviewProps = {
  locale: "es",
  appUrl: "http://localhost:3000",
  audience: "signer",
  recipientName: "Lucía",
  title: "Contrato de servicios 2026",
  verificationCode: "DF-7K3Q-9X2M",
  verifyUrl: "http://localhost:3000/es/verificar?code=DF-7K3Q-9X2M",
  files: [
    { label: "PDF firmado · Contrato.pdf", url: "https://example.com/1" },
    { label: "Certificado de evidencias", url: "https://example.com/2" },
  ],
  tsa: { authority: "Mensatek TSA", genTime: new Date().toISOString(), serial: "0x1A2B3C" },
} satisfies EnvelopeCompletedProps;
