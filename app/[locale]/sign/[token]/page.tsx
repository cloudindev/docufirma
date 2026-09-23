import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { getFormatter, getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { type SigningDocument, SigningFlow } from "@/components/signing/signing-flow";
import { SigningState } from "@/components/signing/signing-state";
import { CONSENT_TEXT_VERSION, LIMITS } from "@/lib/config";
import { sendEnvelopeNotice } from "@/lib/email";
import { appUrl } from "@/lib/env-public";
import { clientIpFrom } from "@/lib/http";
import { getPathname } from "@/lib/i18n/navigation";
import { resolveLocale } from "@/lib/i18n/server";
import { rateLimit } from "@/lib/rate-limit";
import { resolveSigningToken, stateFromSqlError } from "@/lib/signing/session";
import { BUCKETS } from "@/lib/storage/paths";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sign/[token]">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "signing" });
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}

function Shell({
  logoUrl,
  poweredBy,
  children,
}: {
  logoUrl: string | null;
  poweredBy: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg-soft">
      <header className="border-b border-border bg-bg">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-4 px-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- sender branding from a public endpoint
            <img src={logoUrl} alt="" className="h-9 max-w-[180px] object-contain" />
          ) : (
            <Logo />
          )}
          <span className="hidden text-xs text-ink-muted sm:inline">{poweredBy}</span>
        </div>
      </header>
      <main id="main" className="w-full flex-1 px-4 py-6 sm:py-10">
        {children}
      </main>
      <footer className="py-6 text-center text-xs text-ink-muted">
        <Logo className="scale-75 opacity-70" />
      </footer>
    </div>
  );
}

export default async function SignPage({ params }: PageProps<"/[locale]/sign/[token]">) {
  const { token } = await params;
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "signing" });
  const format = await getFormatter({ locale });
  const h = await headers();
  const ip = clientIpFrom(h);

  const limit = await rateLimit(`sign:view:${ip ?? "unknown"}`, 30, 60);
  if (!limit.allowed) {
    return (
      <Shell logoUrl={null} poweredBy={t("poweredBy")}>
        <SigningState state="rate_limited" />
      </Shell>
    );
  }

  const ctx = await resolveSigningToken(token);
  const logoUrl =
    ctx.hasLogo && ctx.envelope?.userId ? `/api/branding/${ctx.envelope.userId}` : null;
  if (ctx.state !== "ready" || !ctx.envelope || !ctx.signer || !ctx.documents) {
    return (
      <Shell logoUrl={logoUrl} poweredBy={t("poweredBy")}>
        <SigningState state={ctx.state} />
      </Shell>
    );
  }

  const admin = createAdminClient();
  const { data: viewed, error } = await admin.rpc("mark_signer_viewed", {
    p_token_hash: ctx.tokenHash,
    p_ip: ip ?? undefined,
    p_user_agent: h.get("user-agent")?.slice(0, 512) ?? undefined,
  });
  if (error) {
    const state = stateFromSqlError(error.message);
    return (
      <Shell logoUrl={logoUrl} poweredBy={t("poweredBy")}>
        <SigningState state={state === "error" ? "invalid" : state} />
      </Shell>
    );
  }

  const envelope = ctx.envelope;
  const signer = ctx.signer;
  if ((viewed as { first_view?: boolean } | null)?.first_view && envelope.userId) {
    after(async () => {
      const { data: sender } = await admin
        .from("profiles")
        .select("email, locale, notify_on_view")
        .eq("id", envelope.userId!)
        .maybeSingle();
      if (!sender?.notify_on_view) return;
      const senderLocale = sender.locale === "en" ? "en" : "es";
      await sendEnvelopeNotice(sender.email, {
        locale: senderLocale,
        kind: "viewed",
        title: envelope.title,
        signerName: `${signer.firstName} ${signer.lastName}`,
        signerEmail: signer.email,
        envelopeUrl: appUrl(
          getPathname({
            href: { pathname: "/app/envelopes/[id]", params: { id: envelope.id } },
            locale: senderLocale,
          }),
        ),
      });
    });
  }

  const { data: urls } = await admin.storage.from(BUCKETS.originals).createSignedUrls(
    ctx.documents.map((d) => d.path),
    LIMITS.signerUrlTtlSeconds,
  );
  const documents: SigningDocument[] = ctx.documents.map((d, i) => ({
    id: d.id,
    name: d.name,
    pageCount: d.pageCount,
    url: urls?.[i]?.signedUrl ?? "",
  }));

  const senderName = envelope.senderCompany
    ? `${envelope.senderName} (${envelope.senderCompany})`
    : (envelope.senderName ?? "DocuFirma");

  return (
    <Shell logoUrl={logoUrl} poweredBy={t("poweredBy")}>
      <SigningFlow
        token={token}
        senderName={senderName}
        signer={{ firstName: signer.firstName, lastName: signer.lastName, email: signer.email }}
        title={envelope.title}
        message={envelope.message}
        expiresLabel={
          envelope.expiresAt ? format.dateTime(new Date(envelope.expiresAt), "long") : null
        }
        documents={documents}
        consentVersion={CONSENT_TEXT_VERSION}
      />
    </Shell>
  );
}
