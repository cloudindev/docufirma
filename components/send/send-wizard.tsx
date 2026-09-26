"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CloudCheck, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { saveDraft, sendEnvelope } from "@/app/[locale]/app/(shell)/send/actions";
import { toast } from "@/components/ui/toaster";
import {
  type EnvelopeSettingsInput,
  envelopeSettingsSchema,
  sendEnvelopeSchema,
  signerSchema,
} from "@/lib/envelopes/schemas";
import { getPathname, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { useLocale } from "next-intl";
import { DocumentsStep } from "./documents-step";
import { NoCreditsDialog } from "./no-credits-dialog";
import { RecipientsStep } from "./recipients-step";
import { ReviewStep } from "./review-step";
import type { WizardContact, WizardDocument } from "./types";

const STEPS = ["documents", "recipients", "review"] as const;

export function SendWizard({
  initialEnvelopeId,
  initialDocuments,
  initialSettings,
  contacts,
  credits,
  docxEnabled,
  smsAvailable,
  smsBalance,
}: {
  initialEnvelopeId: string | null;
  initialDocuments: WizardDocument[];
  initialSettings: EnvelopeSettingsInput;
  contacts: WizardContact[];
  credits: number;
  docxEnabled: boolean;
  smsAvailable: boolean;
  smsBalance: number;
}) {
  const t = useTranslations("send");
  const te = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(
    initialDocuments.length > 0 && initialSettings.signers.length > 0 ? 1 : 0,
  );
  const [envelopeId, setEnvelopeId] = useState<string | null>(initialEnvelopeId);
  const [documents, setDocuments] = useState<WizardDocument[]>(initialDocuments);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [sending, startSending] = useTransition();
  const [sendError, setSendError] = useState<string>();
  const [noCredits, setNoCredits] = useState<{ cost: number; available: number } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const form = useForm<EnvelopeSettingsInput>({
    resolver: zodResolver(sendEnvelopeSchema),
    defaultValues: initialSettings,
    mode: "onTouched",
  });

  // Keep the first document name as default title.
  useEffect(() => {
    if (!form.getValues("title") && documents[0]) {
      form.setValue("title", documents[0].name.replace(/\.[^.]+$/, ""));
    }
  }, [documents, form]);

  // Autosave (debounced) of settings + complete signer rows.
  const watched = useWatch({ control: form.control });
  const firstRun = useRef(true);
  useEffect(() => {
    if (!envelopeId) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const handle = setTimeout(async () => {
      const values = form.getValues();
      const payload = {
        ...values,
        signers: (values.signers ?? []).filter((s) => signerSchema.safeParse(s).success),
      };
      const parsed = envelopeSettingsSchema.safeParse(payload);
      if (!parsed.success) return;
      setSaveState("saving");
      const res = await saveDraft(envelopeId, parsed.data);
      setSaveState(res.ok ? "saved" : "idle");
    }, 900);
    return () => clearTimeout(handle);
  }, [watched, envelopeId, form]);

  const goTo = (next: 0 | 1 | 2) => {
    setStep(next);
    setSendError(undefined);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onEnvelopeCreated = (id: string) => {
    setEnvelopeId(id);
    // Update the URL without remounting the wizard (keeps upload state).
    window.history.replaceState(
      null,
      "",
      getPathname({ href: { pathname: "/app/send/[id]", params: { id } }, locale: locale as "es" }),
    );
  };

  // handleSubmit (not trigger) marks the form as submitted, so errors are re-validated on change
  // while typing instead of on blur — avoids layout shifts that swallow the next click.
  const toReview = () => {
    if ((form.getValues("signers") ?? []).length === 0)
      form.setValue("signers", [
        {
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          requireSmsOtp: false,
          delivery: "email",
        },
      ]);
    void form.handleSubmit(() => goTo(2))();
  };

  const send = () =>
    startSending(async () => {
      if (!envelopeId) return;
      setSendError(undefined);
      const values = form.getValues();
      const res = await sendEnvelope(envelopeId, values);
      if (res.ok) {
        toast.success(t("review.sent", { count: res.data.notified }));
        router.push({ pathname: "/app/envelopes/[id]", params: { id: envelopeId } });
        return;
      }
      if (res.error === "insufficient_credits" && "needed" in res) {
        setNoCredits({ cost: res.needed, available: res.available });
        return;
      }
      if (res.error === "email_not_verified") return setSendError(t("review.verifyEmail"));
      if (res.error === "validation") {
        goTo(1);
        return void form.handleSubmit(() => undefined)();
      }
      const key = `send.errors.${res.error}`;
      setSendError(
        te.has(key as "send.errors.generic")
          ? te(key as "send.errors.generic")
          : t("errors.generic"),
      );
    });

  const signersCount = (form.getValues("signers") ?? []).length;

  return (
    <div ref={topRef} className="mx-auto max-w-4xl scroll-mt-24">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl">{t("title")}</h1>
          <p
            className="mt-1 flex h-5 items-center gap-1.5 text-xs text-ink-muted"
            aria-live="polite"
          >
            {saveState === "saving" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> {t("saving")}
              </>
            ) : saveState === "saved" ? (
              <>
                <CloudCheck className="size-3.5" aria-hidden /> {t("draftSaved")}
              </>
            ) : null}
          </p>
        </div>
        <ol
          className="flex items-center gap-2 sm:gap-3"
          aria-label={t("steps.label", { current: step + 1, total: 3 })}
        >
          {STEPS.map((key, i) => (
            <li key={key} className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                disabled={i > step || sending}
                onClick={() => goTo(i as 0 | 1 | 2)}
                aria-current={i === step ? "step" : undefined}
                className="flex cursor-pointer items-center gap-2 disabled:cursor-default"
              >
                <span
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                    i < step && "bg-primary text-white",
                    i === step && "bg-primary text-white ring-4 ring-primary-soft",
                    i > step && "bg-bg text-ink-muted ring-1 ring-border",
                  )}
                >
                  {i < step ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "hidden text-sm font-medium md:inline",
                    i === step ? "text-ink" : "text-ink-muted",
                  )}
                >
                  {t(`steps.${key}`)}
                </span>
              </button>
              {i < STEPS.length - 1 ? (
                <span aria-hidden className="h-px w-5 bg-border sm:w-8" />
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      {step === 0 ? (
        <DocumentsStep
          envelopeId={envelopeId}
          onEnvelopeCreated={onEnvelopeCreated}
          documents={documents}
          setDocuments={setDocuments}
          docxEnabled={docxEnabled}
          onContinue={() => {
            if (signersCount === 0)
              form.setValue("signers", [
                {
                  firstName: "",
                  lastName: "",
                  email: "",
                  phone: "",
                  requireSmsOtp: false,
                  delivery: "email",
                },
              ]);
            goTo(1);
          }}
        />
      ) : null}
      {step === 1 ? (
        <RecipientsStep
          form={form}
          contacts={contacts}
          smsAvailable={smsAvailable}
          smsBalance={smsBalance}
          onBack={() => goTo(0)}
          onContinue={toReview}
        />
      ) : null}
      {step === 2 ? (
        <ReviewStep
          form={form}
          documents={documents}
          credits={credits}
          sending={sending}
          error={sendError}
          onEdit={goTo}
          onBack={() => goTo(1)}
          onSend={send}
        />
      ) : null}

      <NoCreditsDialog
        open={noCredits !== null}
        onOpenChange={(o) => !o && setNoCredits(null)}
        cost={noCredits?.cost ?? 0}
        available={noCredits?.available ?? 0}
      />
    </div>
  );
}
