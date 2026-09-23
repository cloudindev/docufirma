import { Text } from "@react-email/components";
import {
  colors,
  EmailBox,
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./components/layout";
import { type EmailLocale, emailTranslator, formatEmailDate } from "./i18n";

export type SignerInvitationProps = {
  locale: EmailLocale;
  appUrl: string;
  logoUrl?: string | null;
  signerName: string;
  senderName: string;
  title: string;
  message?: string | null;
  documents: string[];
  expiresAt: string;
  signUrl: string;
  reminder?: boolean;
};

export function signerInvitationSubject(
  p: Pick<SignerInvitationProps, "locale" | "senderName" | "title" | "reminder">,
) {
  const t = emailTranslator(p.locale);
  return p.reminder
    ? t("reminder.subject", { title: p.title })
    : t("invitation.subject", { sender: p.senderName, title: p.title });
}

export default function SignerInvitation(p: SignerInvitationProps) {
  const t = emailTranslator(p.locale);
  const count = p.documents.length;
  const date = formatEmailDate(p.expiresAt, p.locale);
  return (
    <EmailLayout
      lang={p.locale}
      preview={
        p.reminder
          ? t("reminder.preview", { sender: p.senderName })
          : t("invitation.preview", { count })
      }
      logoUrl={p.logoUrl}
      appUrl={p.appUrl}
      footer={t("common.footer")}
      footerNote={`${t("common.automatic", { sender: p.senderName })} ${t("common.security")}`}
    >
      <EmailHeading>
        {p.reminder ? t("reminder.heading") : t("invitation.heading", { count })}
      </EmailHeading>
      <EmailText>
        {p.reminder
          ? t("reminder.body", { name: p.signerName, sender: p.senderName, title: p.title })
          : t("invitation.body", { name: p.signerName, sender: p.senderName, count })}
      </EmailText>
      {p.message ? (
        <EmailBox>
          <Text style={{ fontSize: 13, color: colors.muted, margin: "0 0 6px" }}>
            {t("common.messageFrom", { sender: p.senderName })}
          </Text>
          <Text style={{ fontSize: 15, lineHeight: "23px", margin: 0, whiteSpace: "pre-line" }}>
            {p.message}
          </Text>
        </EmailBox>
      ) : null}
      <EmailBox>
        <Text style={{ fontSize: 13, color: colors.muted, margin: "0 0 6px" }}>
          {t("common.documents")}
        </Text>
        {p.documents.map((d) => (
          <Text key={d} style={{ fontSize: 15, margin: "2px 0", fontWeight: 500 }}>
            📄 {d}
          </Text>
        ))}
      </EmailBox>
      <EmailButton href={p.signUrl}>
        {p.reminder ? t("reminder.cta") : t("invitation.cta")}
      </EmailButton>
      <EmailText muted small>
        {p.reminder ? t("reminder.expires", { date }) : t("invitation.expires", { date })}{" "}
        {p.reminder ? null : t("invitation.noAccount")}
      </EmailText>
    </EmailLayout>
  );
}

SignerInvitation.PreviewProps = {
  locale: "es",
  appUrl: "http://localhost:3000",
  signerName: "Lucía",
  senderName: "Carlos Pérez (Pérez Asesores)",
  title: "Contrato de servicios 2026",
  message: "Hola Lucía, te envío el contrato que comentamos. ¡Gracias!",
  documents: ["Contrato de servicios.pdf", "Anexo I - Tarifas.pdf"],
  expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
  signUrl: "http://localhost:3000/es/sign/token",
} satisfies SignerInvitationProps;
