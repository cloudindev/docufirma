import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  History,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { DownloadButton, EnvelopeActions } from "@/components/app/envelope-actions";
import { RemindButton } from "@/components/app/remind-button";
import { EnvelopeStatusBadge, SignerStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type EnvelopeDetail, getEnvelopeDetail } from "@/lib/data/envelopes";
import { Link, redirect } from "@/lib/i18n/navigation";
import { resolveLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatBytes } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/envelopes/[id]">): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("envelopes").select("title").eq("id", id).maybeSingle();
  return { title: data?.title || "DocuFirma" };
}

function eventText(
  e: EnvelopeDetail["events"][number],
  signers: Map<string, string>,
  docs: Map<string, string>,
  t: Awaited<ReturnType<typeof getTranslations<"app.envelope">>>,
) {
  const meta = (e.metadata ?? {}) as Record<string, unknown>;
  const signer = (e.signer_id && signers.get(e.signer_id)) || t("someone");
  const docId = typeof meta.document === "string" ? meta.document : undefined;
  const document =
    (docId && docs.get(docId)) ||
    (typeof meta.file === "string" ? meta.file : undefined) ||
    t("aDocument");
  return t(`events.${e.type}`, { signer, document });
}

export default async function EnvelopeDetailPage({
  params,
}: PageProps<"/[locale]/app/envelopes/[id]">) {
  const { id } = await params;
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "app.envelope" });
  const format = await getFormatter({ locale });
  const supabase = await createClient();
  const detail = await getEnvelopeDetail(supabase, id);
  if (!detail) notFound();
  const { envelope, documents, signers, signed, events } = detail;
  if (envelope.status === "draft")
    redirect({ href: { pathname: "/app/send/[id]", params: { id } }, locale });

  const date = (iso: string | null) => (iso ? format.dateTime(new Date(iso), "long") : "—");
  const signerNames = new Map(signers.map((s) => [s.id, `${s.first_name} ${s.last_name}`]));
  const docNames = new Map(documents.map((d) => [d.id, d.name]));
  const finalizing = Boolean(envelope.all_signed_at) && envelope.status !== "completed";
  const cancelable =
    (envelope.status === "sent" || envelope.status === "viewed") && !envelope.all_signed_at;
  const evidence = signed.find((s) => s.kind === "evidence");
  const pendingSigners = signers.filter((s) => s.status === "sent" || s.status === "viewed");

  const tsaLabel = (s: (typeof signed)[number]) =>
    s.tsa_status === "granted"
      ? t("tsa.granted", { date: date(s.tsa_gen_time) })
      : s.tsa_status === "failed"
        ? t("tsa.failed")
        : t("tsa.pending");

  return (
    <>
      <Link
        href="/app/envelopes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" /> {t("back")}
      </Link>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl break-words sm:text-3xl">{envelope.title}</h1>
            <EnvelopeStatusBadge status={envelope.status} finalizing={finalizing} />
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            {envelope.sent_at ? <span>{t("sentAt", { date: date(envelope.sent_at) })}</span> : null}
            {envelope.completed_at ? (
              <span>{t("completedAt", { date: date(envelope.completed_at) })}</span>
            ) : envelope.expires_at && cancelable ? (
              <span>{t("expiresAt", { date: date(envelope.expires_at) })}</span>
            ) : null}
            <span>{envelope.sequential ? t("sequential") : t("parallel")}</span>
          </p>
          {envelope.verification_code ? (
            <p className="text-sm">
              <span className="text-ink-muted">{t("code")}: </span>
              <span className="font-mono font-medium">{envelope.verification_code}</span>
            </p>
          ) : null}
        </div>
        <EnvelopeActions
          envelopeId={envelope.id}
          status={envelope.status}
          cancelable={cancelable}
          extra={
            cancelable && pendingSigners.length > 0 ? (
              <RemindButton envelopeId={envelope.id} />
            ) : null
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4.5 text-primary" strokeWidth={1.75} /> {t("signers")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {signers.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium">
                        {envelope.sequential ? (
                          <span className="mr-1.5 text-ink-muted">{s.order_index + 1}.</span>
                        ) : null}
                        {s.first_name} {s.last_name}
                      </p>
                      <p className="truncate text-sm text-ink-muted">{s.email}</p>
                      <p className="text-xs text-ink-muted">
                        {s.status === "signed"
                          ? t("signerMeta.signedAt", { date: date(s.signed_at) })
                          : s.status === "declined"
                            ? t("signerMeta.declinedAt", { date: date(s.declined_at) })
                            : s.status === "viewed"
                              ? t("signerMeta.viewedAt", { date: date(s.viewed_at) })
                              : s.status === "sent"
                                ? t("signerMeta.sentAt", { date: date(s.sent_at) })
                                : t("signerMeta.waiting")}
                        {s.status === "sent" || s.status === "viewed"
                          ? ` · ${t("signerMeta.reminders", { count: s.reminder_count })}`
                          : ""}
                      </p>
                      {s.decline_reason ? (
                        <p className="text-sm text-danger">
                          {t("signerMeta.reason", { reason: s.decline_reason })}
                        </p>
                      ) : null}
                    </div>
                    <SignerStatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4.5 text-primary" strokeWidth={1.75} /> {t("documents")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                {documents.map((d) => {
                  const s = signed.find((x) => x.kind === "document" && x.document_id === d.id);
                  return (
                    <li key={d.id} className="space-y-3 rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 font-medium break-words">{d.name}</p>
                        <span className="text-xs text-ink-muted">
                          {d.page_count} pág. · {formatBytes(d.size_bytes)}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] break-all text-ink-muted">
                        SHA-256 {d.original_sha256}
                      </p>
                      {s ? (
                        <p className="flex items-center gap-1.5 text-xs">
                          {s.tsa_status === "granted" ? (
                            <ShieldCheck className="size-3.5 text-success" aria-hidden />
                          ) : (
                            <Clock className="size-3.5 text-warning" aria-hidden />
                          )}
                          {tsaLabel(s)}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <DownloadButton
                          envelopeId={envelope.id}
                          kind="original"
                          id={d.id}
                          label={t("download.original")}
                        />
                        {s ? (
                          <DownloadButton
                            envelopeId={envelope.id}
                            kind="signed"
                            id={s.id}
                            label={t("download.signed")}
                          />
                        ) : null}
                        {s?.tsa_status === "granted" ? (
                          <DownloadButton
                            envelopeId={envelope.id}
                            kind="tsr"
                            id={s.id}
                            label={t("download.tsr")}
                          />
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {evidence ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg-soft p-4">
                  <div className="space-y-1">
                    <p className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="size-4 text-success" aria-hidden />{" "}
                      {t("download.evidence")}
                    </p>
                    <p className="text-xs text-ink-muted">{tsaLabel(evidence)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <DownloadButton
                      envelopeId={envelope.id}
                      kind="evidence"
                      id={evidence.id}
                      label="PDF"
                    />
                    {evidence.tsa_status === "granted" ? (
                      <DownloadButton
                        envelopeId={envelope.id}
                        kind="tsr"
                        id={evidence.id}
                        label=".tsr"
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {envelope.message ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("message")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-ink-muted">{envelope.message}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4.5 text-primary" strokeWidth={1.75} /> {t("timeline")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-5 border-l border-border pl-5">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span
                    aria-hidden
                    className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-bg ${
                      e.type === "signed" || e.type === "completed" || e.type === "tsa_granted"
                        ? "bg-success"
                        : e.type === "declined" ||
                            e.type === "tsa_failed" ||
                            e.type === "email_failed"
                          ? "bg-danger"
                          : "bg-primary"
                    }`}
                  />
                  <p className="text-sm">{eventText(e, signerNames, docNames, t)}</p>
                  <p className="text-xs text-ink-muted">
                    {date(e.created_at)}
                    {e.ip ? (
                      <Badge variant="neutral" className="ml-2 font-mono text-[10px]">
                        {e.ip}
                      </Badge>
                    ) : null}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
