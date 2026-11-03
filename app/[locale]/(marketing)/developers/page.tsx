import { ArrowRight, BadgeCheck, FileJson } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WEBHOOK_EVENTS } from "@/lib/api/webhooks-events";
import { appUrl } from "@/lib/env-public";
import { Link } from "@/lib/i18n/navigation";
import { resolveLocale } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/developers">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "developers" });
  return pageMetadata({
    href: "/developers",
    locale,
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

const SECTIONS = [
  "intro",
  "auth",
  "quickstart",
  "uploads",
  "endpoints",
  "objects",
  "errors",
  "limits",
  "webhooks",
] as const;

const ENDPOINTS = [
  ["GET", "/account", "account"],
  ["GET", "/envelopes", "list"],
  ["POST", "/envelopes", "create"],
  ["GET", "/envelopes/{id}", "get"],
  ["PATCH", "/envelopes/{id}", "update"],
  ["DELETE", "/envelopes/{id}", "delete"],
  ["POST", "/envelopes/{id}/documents", "document"],
  ["POST", "/envelopes/{id}/uploads", "upload"],
  ["POST", "/envelopes/{id}/uploads/{upload_id}/complete", "complete"],
  ["POST", "/envelopes/{id}/send", "send"],
  ["POST", "/envelopes/{id}/cancel", "cancel"],
  ["POST", "/envelopes/{id}/remind", "remind"],
  ["GET", "/envelopes/{id}/files", "files"],
  ["GET", "/envelopes/{id}/events", "events"],
  ["POST", "/envelopes/{id}/signers/{signer_id}/signing-url", "signing"],
] as const;

const ERROR_CODES = ["400", "401", "402", "403", "404", "409", "413", "422", "429"] as const;

function Code({ children, label }: { children: string; label?: string }) {
  return (
    <figure className="overflow-hidden rounded-xl bg-[#0B1B3F] text-[13px] leading-relaxed text-white">
      {label ? (
        <figcaption className="border-b border-white/10 px-4 py-2 text-xs text-white/60">
          {label}
        </figcaption>
      ) : null}
      <pre className="overflow-x-auto p-4">
        <code>{children}</code>
      </pre>
    </figure>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-4">
      <h2 id={`${id}-title`} className="text-2xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

const methodColor: Record<string, string> = {
  GET: "bg-success/12 text-success",
  POST: "bg-bg-tint text-primary",
  PATCH: "bg-warning/15 text-ink",
  DELETE: "bg-danger/10 text-danger",
};

export default async function DevelopersPage({ params }: PageProps<"/[locale]/developers">) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "developers" });
  const base = `${appUrl().replace(/\/$/, "")}/api/v1`;

  const curlAuth = `curl ${base}/account \\
  -H "Authorization: Bearer df_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"`;

  const curlCreate = `curl ${base}/envelopes \\
  -H "Authorization: Bearer $DOCUFIRMA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Contrato de servicios",
    "message": "Hola Lucía, aquí tienes el contrato.",
    "locale": "es",
    "signers": [
      { "first_name": "Lucía", "last_name": "Gómez", "email": "lucia@example.com" }
    ],
    "documents": [
      { "name": "contrato.pdf", "content_base64": "'"$(base64 -w0 contrato.pdf)"'" }
    ],
    "send": true
  }'`;

  const responseCreate = `{
  "id": "6c36f47e-86d5-4693-b4f5-c5da17f37621",
  "object": "envelope",
  "status": "sent",
  "title": "Contrato de servicios",
  "verification_code": "DF-7K2M-9QXA",
  "sent_at": "2026-11-03T10:15:02Z",
  "expires_at": "2026-12-03T10:15:02Z",
  "signers": [
    { "id": "…", "object": "signer", "email": "lucia@example.com", "status": "sent", … }
  ],
  "documents": [
    { "id": "…", "object": "document", "name": "contrato.pdf", "page_count": 3, "sha256": "…" }
  ]
}`;

  const curlUpload = `# 1. Upload slot (valid for 2 hours)
curl -X POST ${base}/envelopes/$ENVELOPE_ID/uploads \\
  -H "Authorization: Bearer $DOCUFIRMA_API_KEY" -H "Content-Type: application/json" \\
  -d '{ "name": "anexo.pdf", "size_bytes": 8421337 }'
# → { "id": "<upload_id>", "upload_url": "https://…", "method": "PUT", … }

# 2. Send the file
curl -X PUT "$UPLOAD_URL" -H "Content-Type: application/pdf" --data-binary @anexo.pdf

# 3. Complete
curl -X POST ${base}/envelopes/$ENVELOPE_ID/uploads/$UPLOAD_ID/complete \\
  -H "Authorization: Bearer $DOCUFIRMA_API_KEY" -H "Content-Type: application/json" \\
  -d '{ "name": "anexo.pdf" }'

# 4. Send the envelope
curl -X POST ${base}/envelopes/$ENVELOPE_ID/send -H "Authorization: Bearer $DOCUFIRMA_API_KEY"`;

  const errorExample = `HTTP/1.1 402 Payment Required
{
  "error": {
    "code": "insufficient_credits",
    "message": "Not enough signatures to send this envelope.",
    "details": { "needed": 3, "available": 1 }
  }
}`;

  const webhookPayload = `POST /webhooks/docufirma HTTP/1.1
Content-Type: application/json
DocuFirma-Signature: t=1793790902,v1=5f0c4e…

{
  "id": "evt_9b1d…",
  "object": "event",
  "type": "envelope.completed",
  "created_at": "2026-11-03T10:42:11Z",
  "data": { "envelope": { "id": "6c36f47e-…", "status": "completed", … } }
}`;

  const webhookVerify = `import crypto from "node:crypto";

export function verifyDocuFirma(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}`;

  return (
    <div className="bg-gradient-to-b from-bg-soft to-bg">
      <div className="container-page space-y-10 py-14 sm:py-20">
        <div className="max-w-3xl space-y-6">
          <Badge className="py-1">
            <BadgeCheck strokeWidth={1.75} /> {t("proBadge")}
          </Badge>
          <SectionHeading
            as="h1"
            align="left"
            eyebrow={t("eyebrow")}
            title={t("title")}
            subtitle={t("subtitle")}
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={{ pathname: "/app/settings", hash: "api" }}>
                {t("getKey")} <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href="/api/v1/openapi.json">
                <FileJson /> {t("openapi")}
              </a>
            </Button>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label={t("toc")} className="hidden lg:block">
            <div className="sticky top-24 space-y-2">
              <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {t("toc")}
              </p>
              <ul className="space-y-1.5 text-sm">
                {SECTIONS.map((s) => (
                  <li key={s}>
                    <a href={`#${s}`} className="text-ink-muted hover:text-primary">
                      {t(`sections.${s}.h`)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div className="min-w-0 space-y-14">
            <Section id="intro" title={t("sections.intro.h")}>
              <p className="leading-relaxed text-ink-muted">{t("sections.intro.p")}</p>
              <p className="text-sm">
                <span className="font-medium">{t("sections.intro.base")}:</span>{" "}
                <code className="rounded-md bg-bg-tint px-1.5 py-0.5 text-primary">{base}</code>
              </p>
            </Section>

            <Section id="auth" title={t("sections.auth.h")}>
              <p className="leading-relaxed text-ink-muted">{t("sections.auth.p")}</p>
              <Code>{curlAuth}</Code>
            </Section>

            <Section id="quickstart" title={t("sections.quickstart.h")}>
              <p className="leading-relaxed text-ink-muted">{t("sections.quickstart.p")}</p>
              <Code label="POST /envelopes">{curlCreate}</Code>
              <Code label="201 Created">{responseCreate}</Code>
            </Section>

            <Section id="uploads" title={t("sections.uploads.h")}>
              <p className="leading-relaxed text-ink-muted">{t("sections.uploads.p")}</p>
              <Code>{curlUpload}</Code>
            </Section>

            <Section id="endpoints" title={t("sections.endpoints.h")}>
              <div className="overflow-x-auto rounded-xl border border-border bg-bg">
                <table className="w-full text-left text-sm">
                  <thead className="bg-bg-soft text-xs text-ink-muted">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">
                        {t("sections.endpoints.method")}
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        {t("sections.endpoints.path")}
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        {t("sections.endpoints.desc")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ENDPOINTS.map(([method, path, key]) => (
                      <tr key={`${method} ${path}`}>
                        <td className="px-4 py-3 align-top">
                          <span
                            className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${methodColor[method]}`}
                          >
                            {method}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top font-mono text-xs whitespace-nowrap">
                          {path}
                        </td>
                        <td className="px-4 py-3 align-top text-ink-muted">
                          {t(`sections.endpoints.items.${key}`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section id="objects" title={t("sections.objects.h")}>
              <p className="leading-relaxed text-ink-muted">{t("sections.objects.p")}</p>
            </Section>

            <Section id="errors" title={t("sections.errors.h")}>
              <p className="leading-relaxed text-ink-muted">{t("sections.errors.p")}</p>
              <Code>{errorExample}</Code>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                {ERROR_CODES.map((code) => (
                  <div key={code} className="contents">
                    <dt className="font-mono font-semibold">{code}</dt>
                    <dd className="text-ink-muted">{t(`sections.errors.codes.${code}`)}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section id="limits" title={t("sections.limits.h")}>
              <p className="leading-relaxed text-ink-muted">{t("sections.limits.p")}</p>
            </Section>

            <Section id="webhooks" title={t("sections.webhooks.h")}>
              <p className="leading-relaxed text-ink-muted">{t("sections.webhooks.p")}</p>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                {WEBHOOK_EVENTS.map((e) => (
                  <div key={e} className="contents">
                    <dt className="font-mono font-semibold">{e}</dt>
                    <dd className="text-ink-muted">
                      {t(`sections.webhooks.events.${e.replace(".", "_") as "envelope_sent"}`)}
                    </dd>
                  </div>
                ))}
              </dl>
              <Code>{webhookPayload}</Code>
              <p className="leading-relaxed text-ink-muted">{t("sections.webhooks.verify")}</p>
              <Code label="Node.js">{webhookVerify}</Code>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
