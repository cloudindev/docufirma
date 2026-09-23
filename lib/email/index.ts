import "server-only";
import AccountNotice, {
  type AccountNoticeProps,
  accountNoticeSubject,
} from "@/emails/account-notice";
import EnvelopeCompleted, {
  type EnvelopeCompletedProps,
  envelopeCompletedSubject,
} from "@/emails/envelope-completed";
import EnvelopeNotice, {
  type EnvelopeNoticeProps,
  envelopeNoticeSubject,
} from "@/emails/envelope-notice";
import SignerInvitation, {
  type SignerInvitationProps,
  signerInvitationSubject,
} from "@/emails/signer-invitation";
import { emailTranslator } from "@/emails/i18n";
import { appUrl } from "@/lib/env-public";
import { sendEmail } from "./send";

export { sendEmail } from "./send";

type WithoutApp<T> = Omit<T, "appUrl">;

export function brandingLogoUrl(
  userId: string | null | undefined,
  logoPath: string | null | undefined,
) {
  if (!userId || !logoPath) return null;
  return appUrl(`/api/branding/${userId}`);
}

export async function sendSignerInvitation(
  to: string,
  props: WithoutApp<SignerInvitationProps>,
  opts: { replyTo?: string; idempotencyKey?: string } = {},
) {
  const full = { ...props, appUrl: appUrl() };
  return sendEmail({
    to,
    subject: signerInvitationSubject(full),
    react: SignerInvitation(full),
    replyTo: opts.replyTo,
    fromName: emailTranslator(props.locale)("common.via", { sender: props.senderName }),
    tag: props.reminder ? "signer-reminder" : "signer-invitation",
    idempotencyKey: opts.idempotencyKey,
  });
}

export async function sendEnvelopeNotice(to: string, props: WithoutApp<EnvelopeNoticeProps>) {
  const full = { ...props, appUrl: appUrl() };
  return sendEmail({
    to,
    subject: envelopeNoticeSubject(full),
    react: EnvelopeNotice(full),
    tag: `envelope-${props.kind}`,
  });
}

export async function sendEnvelopeCompleted(
  to: string,
  props: WithoutApp<EnvelopeCompletedProps>,
  opts: { replyTo?: string; fromName?: string } = {},
) {
  const full = { ...props, appUrl: appUrl() };
  return sendEmail({
    to,
    subject: envelopeCompletedSubject(full),
    react: EnvelopeCompleted(full),
    replyTo: opts.replyTo,
    fromName: opts.fromName,
    tag: `envelope-completed-${props.audience}`,
  });
}

export async function sendAccountNotice(to: string, props: WithoutApp<AccountNoticeProps>) {
  const full = { ...props, appUrl: appUrl() };
  return sendEmail({
    to,
    subject: accountNoticeSubject(full),
    react: AccountNotice(full),
    tag: props.kind,
  });
}
