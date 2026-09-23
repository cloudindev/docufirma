"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { requestPasswordReset, updatePassword } from "@/app/[locale]/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  type ForgotPasswordInput,
  forgotPasswordSchema,
  type ResetPasswordInput,
  resetPasswordSchema,
} from "@/lib/auth/schemas";
import { useTranslateError } from "@/lib/hooks/use-translate-error";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const te = useTranslateError();
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  if (sent) return <Alert variant="success">{t("forgot.sent")}</Alert>;

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={form.handleSubmit((values) =>
        start(async () => {
          setError(undefined);
          const res = await requestPasswordReset(values, locale);
          if (!res.ok) setError(res.error);
          else setSent(true);
        }),
      )}
    >
      {error ? <Alert variant="danger">{t(`errors.${error}` as "errors.generic")}</Alert> : null}
      <FormField
        id="forgot-email"
        label={t("email")}
        error={te(form.formState.errors.email?.message)}
      >
        <Input
          id="forgot-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={!!form.formState.errors.email}
          {...form.register("email")}
        />
      </FormField>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        {t("forgot.submit")}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const te = useTranslateError();
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const errors = form.formState.errors;

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={form.handleSubmit((values) =>
        start(async () => {
          setError(undefined);
          const res = await updatePassword(values, locale);
          if (res && !res.ok) setError(res.error);
        }),
      )}
    >
      {error ? <Alert variant="danger">{t(`errors.${error}` as "errors.generic")}</Alert> : null}
      <FormField
        id="reset-password"
        label={t("reset.password")}
        error={te(errors.password?.message)}
      >
        <PasswordInput
          id="reset-password"
          autoComplete="new-password"
          showLabel={t("showPassword")}
          hideLabel={t("hidePassword")}
          aria-invalid={!!errors.password}
          {...form.register("password")}
        />
      </FormField>
      <FormField id="reset-confirm" label={t("reset.confirm")} error={te(errors.confirm?.message)}>
        <PasswordInput
          id="reset-confirm"
          autoComplete="new-password"
          showLabel={t("showPassword")}
          hideLabel={t("hidePassword")}
          aria-invalid={!!errors.confirm}
          {...form.register("confirm")}
        />
      </FormField>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        {t("reset.submit")}
      </Button>
    </form>
  );
}
