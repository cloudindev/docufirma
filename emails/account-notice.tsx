import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./components/layout";
import { type EmailLocale, emailTranslator } from "./i18n";

/** Account-level emails: welcome, payment failed, low credits, no SMS left. */
export type AccountNoticeProps = {
  locale: EmailLocale;
  appUrl: string;
  kind: "welcome" | "paymentFailed" | "creditsLow" | "smsEmpty";
  name?: string;
  /** Envelope title (smsEmpty). */
  title?: string;
  count?: number;
  ctaUrl: string;
};

export function accountNoticeSubject(p: AccountNoticeProps) {
  const t = emailTranslator(p.locale);
  if (p.kind === "creditsLow") return t("creditsLow.subject", { count: p.count ?? 0 });
  return t(`${p.kind}.subject`);
}

export default function AccountNotice(p: AccountNoticeProps) {
  const t = emailTranslator(p.locale);
  const vars = {
    name: p.name ?? "",
    count: p.count ?? 0,
    credits: p.count ?? 0,
    title: p.title ?? "",
  };
  return (
    <EmailLayout
      lang={p.locale}
      preview={t(`${p.kind}.preview`)}
      appUrl={p.appUrl}
      footer={t("common.footer")}
    >
      <EmailHeading>{t(`${p.kind}.heading`, vars)}</EmailHeading>
      <EmailText>{t(`${p.kind}.body`, vars)}</EmailText>
      <EmailButton href={p.ctaUrl}>{t(`${p.kind}.cta`)}</EmailButton>
    </EmailLayout>
  );
}

AccountNotice.PreviewProps = {
  locale: "es",
  appUrl: "http://localhost:3000",
  kind: "welcome",
  name: "Ana",
  count: 3,
  ctaUrl: "http://localhost:3000/es/app/send",
} satisfies AccountNoticeProps;
