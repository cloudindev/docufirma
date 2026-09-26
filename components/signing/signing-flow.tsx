"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Download,
  Eraser,
  Expand,
  FileCheck2,
  Loader2,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  completeSignature,
  declineSignature,
  getSigningStatus,
  recordDocumentEvent,
  type SigningStatus,
} from "@/app/[locale]/sign/[token]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/lib/i18n/navigation";
import { BIOMETRIC_LIMITS, computeMetrics } from "@/lib/signing/biometrics";
import { cn } from "@/lib/utils";
import { PdfViewer } from "./pdf-viewer";
import { OtpStep } from "./otp-step";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";
import { SigningState } from "./signing-state";

export type SigningDocument = { id: string; name: string; url: string; pageCount: number };

type Phase = "review" | "sign" | "processing" | "done" | "declined" | { state: string };

function deviceType(): "mobile" | "tablet" | "desktop" {
  const ua = navigator.userAgent;
  if (
    /iPad|Tablet|PlayBook|Silk/i.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  )
    return "tablet";
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "mobile";
  return "desktop";
}

export function SigningFlow({
  token,
  senderName,
  signer,
  title,
  message,
  expiresLabel,
  documents,
  consentVersion,
  otp,
  inPerson,
  backHref,
}: {
  token: string;
  senderName: string;
  signer: { firstName: string; lastName: string; email: string };
  title: string;
  message: string | null;
  /** Pre-formatted on the server (avoids ICU differences between Node and browsers). */
  expiresLabel: string | null;
  documents: SigningDocument[];
  consentVersion: string;
  /** SMS one-time code required before signing (sender's choice). */
  otp: { required: boolean; verified: boolean; phoneMasked: string | null };
  /** Signing on the sender's device, in their presence. */
  inPerson: boolean;
  /** Where the host goes back to after an in-person signature. */
  backHref: string | null;
}) {
  const t = useTranslations("signing");
  const [otpVerified, setOtpVerified] = useState(otp.verified);
  const [otpNotice, setOtpNotice] = useState<string>();
  const [phase, setPhase] = useState<Phase>("review");
  const [active, setActive] = useState(0);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [confirmRead, setConfirmRead] = useState(false);
  const viewed = useRef<Set<string>>(new Set());

  // Review step ---------------------------------------------------------------
  useEffect(() => {
    const doc = documents[active];
    if (!doc || viewed.current.has(doc.id)) return;
    viewed.current.add(doc.id);
    void recordDocumentEvent(token, { documentId: doc.id, type: "document_viewed" });
  }, [active, documents, token]);

  const reported = useRef<Set<string>>(new Set());
  const markRead = useCallback(
    (id: string) => {
      if (reported.current.has(id)) return;
      reported.current.add(id);
      void recordDocumentEvent(token, { documentId: id, type: "scrolled_to_end" });
      setRead((prev) => new Set(prev).add(id));
    },
    [token],
  );

  const allRead = documents.every((d) => read.has(d.id));
  const canContinue = allRead || confirmRead;

  // Sign step ------------------------------------------------------------------
  const pad = useRef<SignaturePadHandle>(null);
  const fullPad = useRef<SignaturePadHandle>(null);
  const [consent, setConsent] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [signError, setSignError] = useState<string>();
  const [submitting, startSubmit] = useTransition();
  const [steps, setSteps] = useState<{ signing: boolean; generating: boolean; sealing: boolean }>({
    signing: false,
    generating: false,
    sealing: false,
  });
  const [status, setStatus] = useState<SigningStatus | null>(null);
  const [slow, setSlow] = useState(false);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait) and (max-width: 640px)");
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const poll = useCallback(async () => {
    const started = Date.now();
    while (Date.now() - started < 60_000) {
      const s = await getSigningStatus(token).catch(() => null);
      if (s) {
        setStatus(s);
        if (s.phase === "waiting_others" || s.phase === "done") return s;
        if (s.phase === "sealing") setSteps({ signing: true, generating: true, sealing: false });
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setSlow(true);
    return null;
  }, [token]);

  const submit = () =>
    startSubmit(async () => {
      setSignError(undefined);
      if (!consent) return setSignError(t("sign.needConsent"));
      const handle = fullscreen ? fullPad.current : pad.current;
      const data = handle?.getData();
      const png = handle?.toPng();
      if (!data || !png) return setSignError(t("sign.needSignature"));
      const m = computeMetrics(data);
      if (
        m.pointsCount < BIOMETRIC_LIMITS.minPoints ||
        m.durationMs < BIOMETRIC_LIMITS.minDurationMs
      ) {
        return setSignError(t("sign.tooShort"));
      }
      setFullscreen(false);
      setPhase("processing");
      setSteps({ signing: false, generating: false, sealing: false });
      const res = await completeSignature(token, {
        consent: true,
        consentVersion,
        biometrics: data,
        signaturePng: png,
        clientMeta: {
          screenW: window.screen?.width,
          screenH: window.screen?.height,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          clientTime: new Date().toISOString(),
          deviceType: deviceType(),
        },
      });
      if (!res.ok) {
        if (res.error === "state" && res.state) return setPhase({ state: res.state });
        if (res.error === "otp_required") {
          setOtpVerified(false);
          setOtpNotice(t("otp.expiredNotice"));
          return setPhase("sign");
        }
        setPhase("sign");
        const key = res.error.startsWith("biometrics") ? "biometrics" : res.error;
        return setSignError(
          t.has(`errors.${key}` as "errors.generic")
            ? t(`errors.${key}` as "errors.generic")
            : t("errors.generic"),
        );
      }
      setSteps({ signing: true, generating: false, sealing: false });
      if (!res.allSigned) {
        setStatus({ phase: "waiting_others", downloads: [] });
        return setPhase("done");
      }
      const final = await poll();
      if (final) setSteps({ signing: true, generating: true, sealing: final.phase === "done" });
      setPhase("done");
    });

  // Decline ------------------------------------------------------------------------
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [declining, startDecline] = useTransition();

  if (typeof phase === "object") return <SigningState state={phase.state} />;

  const stepIndex = phase === "review" ? 1 : 2;

  return (
    <div className="mx-auto w-full max-w-4xl">
      {inPerson && (phase === "review" || phase === "sign") ? (
        <Alert variant="info" className="mb-5">
          {t("inPerson.banner", { name: `${signer.firstName} ${signer.lastName}` })}
        </Alert>
      ) : null}
      {phase === "review" || phase === "sign" ? (
        <ol
          className="mb-6 flex items-center gap-3 text-sm"
          aria-label={t("progress", { current: stepIndex })}
        >
          {(["stepReview", "stepSign"] as const).map((k, i) => (
            <li key={k} className="flex items-center gap-3">
              <span
                aria-current={stepIndex === i + 1 ? "step" : undefined}
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                  stepIndex > i + 1
                    ? "bg-primary text-white"
                    : stepIndex === i + 1
                      ? "bg-primary text-white ring-4 ring-primary-soft"
                      : "bg-bg text-ink-muted ring-1 ring-border",
                )}
              >
                {stepIndex > i + 1 ? <CheckCircle2 className="size-4" /> : i + 1}
              </span>
              <span
                className={cn("font-medium", stepIndex === i + 1 ? "text-ink" : "text-ink-muted")}
              >
                {t(k)}
              </span>
              {i === 0 ? <span aria-hidden className="h-px w-8 bg-border" /> : null}
            </li>
          ))}
        </ol>
      ) : null}

      <AnimatePresence mode="wait">
        {phase === "review" ? (
          <motion.section
            key="review"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            <header className="space-y-2">
              <h1 className="text-2xl text-balance sm:text-3xl">
                {t("review.heading", { sender: senderName, count: documents.length })}
              </h1>
              <p className="text-ink-muted">
                {t("review.hello", { name: signer.firstName, count: documents.length })}
              </p>
            </header>
            {message ? (
              <Card className="p-4">
                <p className="text-xs font-medium text-ink-muted">
                  {t("review.messageFrom", { sender: senderName })}
                </p>
                <p className="mt-1 whitespace-pre-line">{message}</p>
              </Card>
            ) : null}

            {documents.length > 1 ? (
              <div
                role="tablist"
                aria-label={t("review.documentsTabs")}
                className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
              >
                {documents.map((d, i) => (
                  <button
                    key={d.id}
                    role="tab"
                    type="button"
                    aria-selected={i === active}
                    onClick={() => setActive(i)}
                    className={cn(
                      "flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                      i === active
                        ? "bg-ink text-white"
                        : "bg-bg text-ink-muted ring-1 ring-border ring-inset hover:text-ink",
                    )}
                  >
                    {read.has(d.id) ? (
                      <CheckCircle2 className="size-4 text-success" aria-hidden />
                    ) : (
                      <Circle className="size-4" aria-hidden />
                    )}
                    <span className="max-w-[12rem] truncate">{d.name}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {documents.map((d, i) => (
              <div key={d.id} hidden={i !== active}>
                <PdfViewer
                  url={d.url}
                  name={d.name}
                  onReachedEnd={() => markRead(d.id)}
                  className="h-[68dvh] sm:h-[72vh]"
                />
              </div>
            ))}

            <div className="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2 text-sm">
                <p
                  className={cn(
                    "flex items-center gap-2",
                    allRead ? "text-success" : "text-ink-muted",
                  )}
                  aria-live="polite"
                >
                  {allRead ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <FileCheck2 className="size-4" />
                  )}
                  {allRead
                    ? t("review.readAll")
                    : `${t("review.readProgress", { read: read.size, total: documents.length })} · ${t("review.scrollHint")}`}
                </p>
                {!allRead ? (
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={confirmRead}
                      onCheckedChange={(v) => setConfirmRead(v === true)}
                    />
                    {t("review.confirmRead")}
                  </label>
                ) : null}
                {expiresLabel ? (
                  <p className="text-xs text-ink-muted">
                    {t("review.expires", { date: expiresLabel })}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="ghost" onClick={() => setDeclineOpen(true)}>
                  {t("review.decline")}
                </Button>
                <Button size="lg" disabled={!canContinue} onClick={() => setPhase("sign")}>
                  {t("review.continue")} <ArrowRight />
                </Button>
              </div>
            </div>
          </motion.section>
        ) : null}

        {phase === "sign" ? (
          <motion.section
            key="sign"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            <header className="space-y-2">
              <h1 className="text-2xl sm:text-3xl">
                {t("sign.heading", { count: documents.length })}
              </h1>
              <p className="text-ink-muted">{t("sign.subheading")}</p>
              <p className="text-sm text-ink-muted">
                {t("sign.signingAs", {
                  name: `${signer.firstName} ${signer.lastName}`,
                  email: signer.email,
                })}
              </p>
            </header>

            {otp.required && !otpVerified ? (
              <OtpStep
                token={token}
                phoneMasked={otp.phoneMasked}
                notice={otpNotice}
                onVerified={() => {
                  setOtpNotice(undefined);
                  setOtpVerified(true);
                }}
              />
            ) : (
              <Card className="space-y-4 p-4 sm:p-6">
                {portrait ? (
                  <p className="flex items-center gap-2 rounded-lg bg-bg-tint px-3 py-2 text-sm text-primary">
                    <RotateCcw className="size-4 shrink-0" aria-hidden /> {t("sign.rotateHint")}
                  </p>
                ) : null}
                <SignaturePad
                  ref={pad}
                  height={portrait ? 200 : 240}
                  label={t("sign.padLabel")}
                  hint={t("sign.padHint")}
                  onChange={setEmpty}
                />
                <div className="flex flex-wrap justify-between gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => pad.current?.clear()}
                    disabled={empty}
                  >
                    <Eraser /> {t("sign.clear")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="sm:hidden"
                    onClick={() => setFullscreen(true)}
                  >
                    <Expand /> {t("sign.fullscreen")}
                  </Button>
                </div>
                <label className="flex items-start gap-3 rounded-xl bg-bg-soft p-4 text-sm leading-relaxed">
                  <Checkbox
                    className="mt-0.5"
                    checked={consent}
                    onCheckedChange={(v) => setConsent(v === true)}
                    aria-describedby="consent-text"
                  />
                  <span id="consent-text">
                    {t.rich("sign.consent", {
                      policy: (c) => (
                        <Link
                          href={{ pathname: "/legal/[slug]", params: { slug: "signature-policy" } }}
                          target="_blank"
                          className="text-primary underline"
                        >
                          {c}
                        </Link>
                      ),
                      privacy: (c) => (
                        <Link
                          href={{ pathname: "/legal/[slug]", params: { slug: "privacy" } }}
                          target="_blank"
                          className="text-primary underline"
                        >
                          {c}
                        </Link>
                      ),
                    })}
                  </span>
                </label>
                {signError ? <Alert variant="danger">{signError}</Alert> : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button variant="ghost" onClick={() => setPhase("review")}>
                    <ArrowLeft /> {t("sign.back")}
                  </Button>
                  <Button size="lg" onClick={submit} loading={submitting} disabled={!consent}>
                    {submitting ? null : <ShieldCheck />} {t("sign.submit")}
                  </Button>
                </div>
              </Card>
            )}

            {fullscreen ? (
              <div
                className="fixed inset-0 z-50 flex flex-col gap-3 bg-bg p-3"
                role="dialog"
                aria-modal="true"
                aria-label={t("sign.padLabel")}
              >
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setFullscreen(false)}>
                    <X /> {t("sign.exitFullscreen")}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => fullPad.current?.clear()}>
                    <Eraser /> {t("sign.clear")}
                  </Button>
                </div>
                <div className="min-h-0 flex-1">
                  <SignaturePad
                    ref={fullPad}
                    fill
                    label={t("sign.padLabel")}
                    hint={t("sign.padHint")}
                    onChange={setEmpty}
                  />
                </div>
                <Button size="lg" onClick={submit} loading={submitting} disabled={!consent}>
                  {t("sign.submit")}
                </Button>
                {!consent ? (
                  <p className="text-center text-xs text-ink-muted">{t("sign.needConsent")}</p>
                ) : null}
              </div>
            ) : null}
          </motion.section>
        ) : null}

        {phase === "processing" ? (
          <motion.section
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mx-auto max-w-md"
            aria-live="polite"
          >
            <Card className="space-y-6 p-8 text-center">
              <Loader2 className="mx-auto size-10 animate-spin text-primary" aria-hidden />
              <h1 className="text-2xl">{t("processing.title")}</h1>
              <ol className="space-y-3 text-left text-sm">
                {(["signing", "generating", "sealing"] as const).map((k) => (
                  <li key={k} className="flex items-center gap-3">
                    {steps[k] ? (
                      <CheckCircle2 className="size-5 text-success" aria-hidden />
                    ) : (
                      <Loader2 className="size-5 animate-spin text-ink-muted" aria-hidden />
                    )}
                    <span className={steps[k] ? "text-ink" : "text-ink-muted"}>
                      {t(`processing.${k}`)}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          </motion.section>
        ) : null}

        {phase === "done" ? (
          <motion.section
            key="done"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mx-auto max-w-lg"
          >
            <Card className="space-y-5 p-8 text-center">
              <span className="mx-auto inline-flex size-16 items-center justify-center rounded-full bg-success/12 text-success">
                <CheckCircle2 className="size-9" strokeWidth={1.75} aria-hidden />
              </span>
              <h1 className="text-2xl sm:text-3xl">{t("success.title")}</h1>
              <p className="text-ink-muted">
                {status?.phase === "waiting_others"
                  ? t("success.waiting")
                  : slow
                    ? t("success.slow")
                    : t("success.body")}
              </p>
              {status && status.downloads.length > 0 ? (
                <div className="space-y-2 text-left">
                  <p className="text-sm font-semibold">{t("success.downloads")}</p>
                  {status.downloads.map((d) => (
                    <Button
                      key={d.url}
                      asChild
                      variant="secondary"
                      className="w-full justify-start"
                    >
                      <a href={d.url} download>
                        <Download />{" "}
                        {d.kind === "evidence"
                          ? t("success.evidence")
                          : t("success.signedPdf", { name: d.label })}
                      </a>
                    </Button>
                  ))}
                  {status.phase === "sealing" ? (
                    <p className="text-xs text-ink-muted">{t("success.sealing")}</p>
                  ) : null}
                </div>
              ) : null}
              {backHref ? (
                <Button asChild variant="secondary" className="w-full">
                  <a href={backHref}>
                    <ArrowLeft /> {t("inPerson.back")}
                  </a>
                </Button>
              ) : (
                <p className="text-sm text-ink-muted">{t("success.close")}</p>
              )}
            </Card>
          </motion.section>
        ) : null}

        {phase === "declined" ? (
          <motion.section
            key="declined"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mx-auto max-w-lg"
          >
            <Card className="space-y-3 p-8 text-center">
              <h1 className="text-2xl">{t("states.declined.title")}</h1>
              <p className="text-ink-muted">{t("decline.done", { sender: senderName })}</p>
            </Card>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("decline.title")}</DialogTitle>
            <DialogDescription>{t("decline.body", { sender: senderName })}</DialogDescription>
          </DialogHeader>
          <label htmlFor="decline-reason" className="text-sm font-medium">
            {t("decline.reason")}
          </label>
          <Textarea
            id="decline-reason"
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeclineOpen(false)}>
              {t("decline.cancel")}
            </Button>
            <Button
              variant="danger"
              loading={declining}
              onClick={() =>
                startDecline(async () => {
                  const res = await declineSignature(token, reason);
                  setDeclineOpen(false);
                  if (res.ok) setPhase("declined");
                  else if (res.state) setPhase({ state: res.state });
                })
              }
            >
              {t("decline.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="sr-only">{title}</p>
    </div>
  );
}
