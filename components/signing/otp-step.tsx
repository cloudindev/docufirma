"use client";

import { MessageSquareLock, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { requestSigningCode, verifySigningCode } from "@/app/[locale]/sign/[token]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * SMS one-time code shown before the signature pad when the sender required it.
 * The code is checked on the server; the signature itself is refused without it.
 */
export function OtpStep({
  token,
  phoneMasked,
  notice,
  onVerified,
}: {
  token: string;
  phoneMasked: string | null;
  /** Extra message, e.g. when a previous confirmation expired. */
  notice?: string;
  onVerified: () => void;
}) {
  const t = useTranslations("signing.otp");
  const inputId = useId();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [sending, startSending] = useTransition();
  const [verifying, startVerifying] = useTransition();

  const errorText = (key: string, attemptsLeft?: number) =>
    key === "otp_invalid" && attemptsLeft !== undefined
      ? t("errors.invalidLeft", { count: attemptsLeft })
      : t.has(`errors.${key}` as "errors.generic")
        ? t(`errors.${key}` as "errors.generic")
        : t("errors.generic");

  const send = () =>
    startSending(async () => {
      setError(undefined);
      setInfo(undefined);
      const res = await requestSigningCode(token);
      if (!res.ok) return setError(errorText(res.error));
      setSent(true);
      setCode("");
      setInfo(t("sentTo", { phone: res.phone ?? phoneMasked ?? "" }));
    });

  const verify = () =>
    startVerifying(async () => {
      setError(undefined);
      if (!/^\d{6}$/.test(code)) return setError(t("errors.otp_invalid"));
      const res = await verifySigningCode(token, code);
      if (res.ok) return onVerified();
      if (res.error === "otp_expired" || res.error === "otp_too_many_attempts") setSent(false);
      setError(errorText(res.error, "attemptsLeft" in res ? res.attemptsLeft : undefined));
    });

  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-bg-tint text-primary">
          <MessageSquareLock className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg">{t("title")}</h2>
          <p className="text-sm text-ink-muted">{t("description", { phone: phoneMasked ?? "" })}</p>
        </div>
      </div>
      {notice ? <Alert variant="warning">{notice}</Alert> : null}
      {info ? <Alert variant="info">{info}</Alert> : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}

      {sent ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <label htmlFor={inputId} className="block text-sm font-medium">
            {t("codeLabel")}
          </label>
          <Input
            id={inputId}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="123456"
            className="max-w-48 text-center font-mono text-2xl tracking-[0.4em]"
            aria-describedby={`${inputId}-hint`}
            autoFocus
          />
          <p id={`${inputId}-hint`} className="text-xs text-ink-muted">
            {t("codeHint")}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={send} loading={sending}>
              {sending ? null : <RotateCw />} {t("resend")}
            </Button>
            <Button type="submit" size="lg" loading={verifying} disabled={code.length !== 6}>
              {t("verify")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex justify-end">
          <Button size="lg" onClick={send} loading={sending}>
            {t("send")}
          </Button>
        </div>
      )}
    </Card>
  );
}
