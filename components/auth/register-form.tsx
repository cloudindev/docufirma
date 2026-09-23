"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { signUp } from "@/app/[locale]/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { type RegisterInput, registerSchema } from "@/lib/auth/schemas";
import { useTranslateError } from "@/lib/hooks/use-translate-error";
import { Link } from "@/lib/i18n/navigation";

export function RegisterForm() {
  const t = useTranslations("auth");
  const te = useTranslateError();
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      acceptTerms: false as unknown as true,
    },
  });
  const errors = form.formState.errors;

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center" role="status">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-bg-tint text-primary">
          <MailCheck className="size-7" strokeWidth={1.75} aria-hidden />
        </span>
        <h2 className="text-2xl">{t("register.checkEmailTitle")}</h2>
        <p className="text-ink-muted">{t("register.checkEmailBody", { email: sentTo })}</p>
        <p className="text-sm text-ink-muted">{t("register.checkEmailHint")}</p>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={form.handleSubmit((values) =>
        start(async () => {
          setError(undefined);
          const res = await signUp(values, locale);
          if (!res.ok) {
            setError(res.error);
            Object.entries(res.fieldErrors ?? {}).forEach(([field, message]) =>
              form.setError(field as keyof RegisterInput, { message }),
            );
          } else {
            setSentTo(values.email);
          }
        }),
      )}
    >
      {error ? <Alert variant="danger">{t(`errors.${error}` as "errors.generic")}</Alert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="reg-first" label={t("firstName")} error={te(errors.firstName?.message)}>
          <Input
            id="reg-first"
            autoComplete="given-name"
            aria-invalid={!!errors.firstName}
            {...form.register("firstName")}
          />
        </FormField>
        <FormField id="reg-last" label={t("lastName")} error={te(errors.lastName?.message)}>
          <Input
            id="reg-last"
            autoComplete="family-name"
            aria-invalid={!!errors.lastName}
            {...form.register("lastName")}
          />
        </FormField>
      </div>
      <FormField id="reg-email" label={t("email")} error={te(errors.email?.message)}>
        <Input
          id="reg-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={!!errors.email}
          {...form.register("email")}
        />
      </FormField>
      <FormField
        id="reg-password"
        label={t("password")}
        hint={t("register.passwordHint")}
        error={te(errors.password?.message)}
      >
        <PasswordInput
          id="reg-password"
          autoComplete="new-password"
          showLabel={t("showPassword")}
          hideLabel={t("hidePassword")}
          aria-invalid={!!errors.password}
          {...form.register("password")}
        />
      </FormField>
      <div className="grid gap-2">
        <div className="flex items-start gap-3">
          <Controller
            control={form.control}
            name="acceptTerms"
            render={({ field }) => (
              <Checkbox
                id="reg-terms"
                className="mt-0.5"
                checked={field.value === true}
                onCheckedChange={(v) => field.onChange(v === true)}
                aria-invalid={!!errors.acceptTerms}
              />
            )}
          />
          <label htmlFor="reg-terms" className="text-sm leading-relaxed text-ink-muted">
            {t.rich("register.acceptTerms", {
              terms: (chunks) => (
                <Link
                  href={{ pathname: "/legal/[slug]", params: { slug: "terms" } }}
                  className="text-primary hover:underline"
                  target="_blank"
                >
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link
                  href={{ pathname: "/legal/[slug]", params: { slug: "privacy" } }}
                  className="text-primary hover:underline"
                  target="_blank"
                >
                  {chunks}
                </Link>
              ),
            })}
          </label>
        </div>
        {errors.acceptTerms ? (
          <p role="alert" className="text-sm text-danger">
            {te(errors.acceptTerms.message)}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        {t("register.submit")}
      </Button>
    </form>
  );
}
