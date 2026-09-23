"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { sendMagicLink, signInWithPassword } from "@/app/[locale]/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type LoginInput,
  loginSchema,
  type MagicLinkInput,
  magicLinkSchema,
} from "@/lib/auth/schemas";
import { useTranslateError } from "@/lib/hooks/use-translate-error";
import { Link } from "@/lib/i18n/navigation";

type ErrorKey = `errors.${string}`;

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const t = useTranslations("auth");
  const te = useTranslateError();
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>(initialError);
  const [magicSent, setMagicSent] = useState(false);

  const passwordForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const magicForm = useForm<MagicLinkInput>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: "" },
  });

  const errorText = error ? t(`errors.${error}` as ErrorKey as "errors.generic") : undefined;

  return (
    <Tabs defaultValue="password" onValueChange={() => setError(undefined)}>
      <TabsList className="mb-6 w-full [&>button]:flex-1">
        <TabsTrigger value="password">{t("login.tabPassword")}</TabsTrigger>
        <TabsTrigger value="magic">{t("login.tabMagic")}</TabsTrigger>
      </TabsList>

      {errorText ? (
        <Alert variant="danger" className="mb-5">
          {errorText}
        </Alert>
      ) : null}

      <TabsContent value="password">
        <form
          noValidate
          className="grid gap-5"
          onSubmit={passwordForm.handleSubmit((values) =>
            start(async () => {
              setError(undefined);
              const res = await signInWithPassword(values, locale, next);
              if (res && !res.ok) setError(res.error);
            }),
          )}
        >
          <FormField
            id="login-email"
            label={t("email")}
            error={te(passwordForm.formState.errors.email?.message)}
          >
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              aria-invalid={!!passwordForm.formState.errors.email}
              {...passwordForm.register("email")}
            />
          </FormField>
          <FormField
            id="login-password"
            label={t("password")}
            labelAction={
              <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                {t("login.forgot")}
              </Link>
            }
            error={te(passwordForm.formState.errors.password?.message)}
          >
            <PasswordInput
              id="login-password"
              autoComplete="current-password"
              showLabel={t("showPassword")}
              hideLabel={t("hidePassword")}
              aria-invalid={!!passwordForm.formState.errors.password}
              {...passwordForm.register("password")}
            />
          </FormField>
          <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
            {t("login.submit")}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="magic">
        {magicSent ? (
          <Alert variant="success">{t("login.magicSent")}</Alert>
        ) : (
          <form
            noValidate
            className="grid gap-5"
            onSubmit={magicForm.handleSubmit((values) =>
              start(async () => {
                setError(undefined);
                const res = await sendMagicLink(values, locale, next);
                if (!res.ok) setError(res.error);
                else setMagicSent(true);
              }),
            )}
          >
            <FormField
              id="magic-email"
              label={t("email")}
              hint={t("login.magicHint")}
              error={te(magicForm.formState.errors.email?.message)}
            >
              <Input
                id="magic-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                aria-invalid={!!magicForm.formState.errors.email}
                {...magicForm.register("email")}
              />
            </FormField>
            <Button type="submit" size="lg" loading={pending} className="w-full">
              {t("login.magicSubmit")}
            </Button>
          </form>
        )}
      </TabsContent>
    </Tabs>
  );
}
