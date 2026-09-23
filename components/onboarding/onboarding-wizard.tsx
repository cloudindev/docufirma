"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Building2, Check, FileSignature, Languages } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { completeOnboarding } from "@/app/[locale]/app/onboarding/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { type OnboardingInput, onboardingSchema } from "@/lib/auth/schemas";
import { useTranslateError } from "@/lib/hooks/use-translate-error";
import { useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "profile", icon: Building2 },
  { key: "language", icon: Languages },
  { key: "start", icon: FileSignature },
] as const;

export function OnboardingWizard({ defaults }: { defaults: OnboardingInput }) {
  const t = useTranslations("onboarding");
  const te = useTranslateError();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: defaults,
  });
  const errors = form.formState.errors;
  const locale = form.watch("locale");

  const finish = (target: "/app" | "/app/send") =>
    form.handleSubmit((values) =>
      start(async () => {
        setError(undefined);
        const res = await completeOnboarding(values);
        if (!res.ok) {
          setError(t("error"));
          return;
        }
        router.replace(target, { locale: values.locale });
        router.refresh();
      }),
    )();

  return (
    <div className="w-full max-w-xl">
      <ol className="mb-8 flex items-center justify-center gap-3" aria-label={t("progressLabel")}>
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-3">
            <span
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                i < step && "bg-primary text-white",
                i === step && "bg-primary text-white ring-4 ring-primary-soft",
                i > step && "bg-bg text-ink-muted ring-1 ring-border",
              )}
            >
              {i < step ? <Check className="size-4" /> : i + 1}
            </span>
            {i < STEPS.length - 1 ? (
              <span className="h-px w-8 bg-border sm:w-14" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>

      <Card className="p-6 sm:p-10">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {step === 0 ? (
            <form
              noValidate
              className="grid gap-5"
              onSubmit={async (e) => {
                e.preventDefault();
                const valid = await form.trigger(["firstName", "lastName", "companyName"]);
                if (valid) setStep(1);
              }}
            >
              <header className="mb-2 space-y-2">
                <h1 className="text-2xl sm:text-3xl">{t("profile.title")}</h1>
                <p className="text-ink-muted">{t("profile.subtitle")}</p>
              </header>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  id="ob-first"
                  label={t("profile.firstName")}
                  error={te(errors.firstName?.message)}
                >
                  <Input
                    id="ob-first"
                    autoComplete="given-name"
                    aria-invalid={!!errors.firstName}
                    {...form.register("firstName")}
                  />
                </FormField>
                <FormField
                  id="ob-last"
                  label={t("profile.lastName")}
                  error={te(errors.lastName?.message)}
                >
                  <Input
                    id="ob-last"
                    autoComplete="family-name"
                    aria-invalid={!!errors.lastName}
                    {...form.register("lastName")}
                  />
                </FormField>
              </div>
              <FormField
                id="ob-company"
                label={t("profile.company")}
                optionalLabel={t("optional")}
                hint={t("profile.companyHint")}
                error={te(errors.companyName?.message)}
              >
                <Input
                  id="ob-company"
                  autoComplete="organization"
                  {...form.register("companyName")}
                />
              </FormField>
              <Button type="submit" size="lg" className="mt-2 w-full sm:w-auto sm:justify-self-end">
                {t("next")} <ArrowRight />
              </Button>
            </form>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-6">
              <header className="space-y-2">
                <h1 className="text-2xl sm:text-3xl">{t("language.title")}</h1>
                <p className="text-ink-muted">{t("language.subtitle")}</p>
              </header>
              <div
                role="radiogroup"
                aria-label={t("language.title")}
                className="grid gap-3 sm:grid-cols-2"
              >
                {(["es", "en"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={locale === l}
                    onClick={() => form.setValue("locale", l)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-xl border bg-bg p-4 text-left transition-colors",
                      locale === l
                        ? "border-primary ring-4 ring-primary-soft"
                        : "border-border hover:border-ink-muted/40",
                    )}
                  >
                    <span>
                      <span className="block font-medium">{t(`language.${l}`)}</span>
                      <span className="text-sm text-ink-muted">{t(`language.${l}Hint`)}</span>
                    </span>
                    {locale === l ? <Check className="size-5 text-primary" /> : null}
                  </button>
                ))}
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  {t("back")}
                </Button>
                <Button size="lg" onClick={() => setStep(2)}>
                  {t("next")} <ArrowRight />
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-6 text-center">
              <span className="mx-auto inline-flex size-16 items-center justify-center rounded-full bg-bg-tint text-primary">
                <FileSignature className="size-8" strokeWidth={1.75} aria-hidden />
              </span>
              <header className="space-y-2">
                <h1 className="text-2xl sm:text-3xl">{t("start.title")}</h1>
                <p className="text-ink-muted">{t("start.subtitle")}</p>
              </header>
              {error ? <Alert variant="danger">{error}</Alert> : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button
                  variant="secondary"
                  size="lg"
                  loading={pending}
                  onClick={() => finish("/app")}
                >
                  {t("start.later")}
                </Button>
                <Button size="lg" loading={pending} onClick={() => finish("/app/send")}>
                  {t("start.cta")} <ArrowRight />
                </Button>
              </div>
            </div>
          ) : null}
        </motion.div>
      </Card>
    </div>
  );
}
