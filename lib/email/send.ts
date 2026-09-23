import "server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { Resend } from "resend";

export type SendEmailInput = {
  to: string;
  subject: string;
  react: ReactElement;
  replyTo?: string;
  fromName?: string;
  tag: string;
  idempotencyKey?: string;
};

export type SendEmailResult = { id: string | null; error?: string };

let resend: Resend | undefined;

function outboxDir() {
  return process.env.EMAIL_OUTBOX_DIR || join(process.cwd(), ".local-stack", "mail");
}

/** "Name <addr>" with the display name sanitised (no quotes / angle brackets / newlines). */
function fromHeader(fromName?: string) {
  const base = process.env.EMAIL_FROM ?? "DocuFirma <no-reply@mail.docufirma.es>";
  if (!fromName) return base;
  const address = base.match(/<([^>]+)>/)?.[1] ?? base;
  const name = fromName.replace(/["<>\r\n]/g, "").slice(0, 80);
  return `"${name}" <${address}>`;
}

/**
 * Sends a transactional email with Resend. Without RESEND_API_KEY (local dev / e2e) the
 * rendered email is written to the outbox directory (EMAIL_OUTBOX_DIR or .local-stack/mail).
 * Never throws: email failures must not break the business transaction that triggered them.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    const html = await render(input.react);
    const text = await render(input.react, { plainText: true });
    const key = process.env.RESEND_API_KEY;

    if (!key) {
      if (process.env.NODE_ENV === "production" && !process.env.EMAIL_OUTBOX_DIR) {
        console.error("[email] RESEND_API_KEY is not configured; email not sent:", input.tag);
        return { id: null, error: "not_configured" };
      }
      const dir = outboxDir();
      mkdirSync(dir, { recursive: true });
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const safeTo = input.to.replace(/[^a-z0-9@._+-]/gi, "_");
      writeFileSync(join(dir, `${id}__${input.tag}__${safeTo}.html`), html);
      writeFileSync(
        join(dir, `${id}__${input.tag}__${safeTo}.json`),
        JSON.stringify(
          {
            id,
            to: input.to,
            subject: input.subject,
            from: fromHeader(input.fromName),
            replyTo: input.replyTo,
            tag: input.tag,
            text,
          },
          null,
          2,
        ),
      );
      console.info(`[email:outbox] ${input.tag} → ${input.to}: ${input.subject}`);
      return { id: `outbox_${id}` };
    }

    resend ??= new Resend(key);
    const { data, error } = await resend.emails.send(
      {
        from: fromHeader(input.fromName),
        to: input.to,
        subject: input.subject,
        html,
        text,
        replyTo: input.replyTo,
        tags: [{ name: "type", value: input.tag.replace(/[^a-zA-Z0-9_-]/g, "_") }],
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    );
    if (error) {
      console.error("[email] resend error", input.tag, error.message);
      return { id: null, error: error.message };
    }
    return { id: data?.id ?? null };
  } catch (error) {
    console.error("[email] failed", input.tag, error);
    return { id: null, error: (error as Error).message };
  }
}
