"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImageUp, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  changePassword,
  deleteAccount,
  removeLogo,
  updatePreferences,
  updateProfile,
  uploadLogo,
} from "@/app/[locale]/app/(shell)/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { type ResetPasswordInput, resetPasswordSchema } from "@/lib/auth/schemas";
import { useTranslateError } from "@/lib/hooks/use-translate-error";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import {
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  type PreferencesInput,
  preferencesSchema,
  type ProfileInput,
  profileSchema,
} from "@/lib/profile/schemas";

export function ProfileForm({ defaults, email }: { defaults: ProfileInput; email: string }) {
  const t = useTranslations("app.settings");
  const tc = useTranslations("app.common");
  const te = useTranslateError();
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: defaults,
  });
  const errors = form.formState.errors;
  return (
    <Card>
      <form
        noValidate
        onSubmit={form.handleSubmit((values) =>
          start(async () => {
            const res = await updateProfile(values);
            if (!res.ok) return void toast.error(t("error"));
            toast.success(t("profile.saved"));
            form.reset(values);
            router.refresh();
          }),
        )}
      >
        <CardHeader>
          <CardTitle>{t("profile.title")}</CardTitle>
          <CardDescription>{t("profile.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="p-first"
            label={t("profile.firstName")}
            error={te(errors.firstName?.message)}
          >
            <Input
              id="p-first"
              autoComplete="given-name"
              aria-invalid={!!errors.firstName}
              {...form.register("firstName")}
            />
          </FormField>
          <FormField id="p-last" label={t("profile.lastName")} error={te(errors.lastName?.message)}>
            <Input
              id="p-last"
              autoComplete="family-name"
              aria-invalid={!!errors.lastName}
              {...form.register("lastName")}
            />
          </FormField>
          <FormField
            id="p-company"
            label={t("profile.company")}
            error={te(errors.companyName?.message)}
          >
            <Input id="p-company" autoComplete="organization" {...form.register("companyName")} />
          </FormField>
          <FormField id="p-tax" label={t("profile.taxId")} error={te(errors.taxId?.message)}>
            <Input
              id="p-tax"
              className="uppercase"
              aria-invalid={!!errors.taxId}
              {...form.register("taxId")}
            />
          </FormField>
          <FormField
            id="p-email"
            label={t("profile.email")}
            hint={t("profile.emailHint")}
            className="sm:col-span-2"
          >
            <Input id="p-email" value={email} readOnly disabled />
          </FormField>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={pending} disabled={!form.formState.isDirty}>
            {tc("save")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function LogoForm({ logoUrl }: { logoUrl: string | null }) {
  const t = useTranslations("app.settings.logo");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [version, setVersion] = useState(0);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES || !LOGO_TYPES.includes(file.type))
      return void toast.error(t("invalid"));
    const fd = new FormData();
    fd.set("logo", file);
    start(async () => {
      const res = await uploadLogo(fd);
      if (!res.ok) return void toast.error(t("invalid"));
      toast.success(t("uploaded"));
      setVersion((v) => v + 1);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-20 w-48 items-center justify-center rounded-xl border border-dashed border-border bg-bg-soft p-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic, auth-less branding endpoint
            <img
              src={`${logoUrl}?v=${version}`}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <ImageUp className="size-6 text-ink-muted" strokeWidth={1.75} aria-hidden />
          )}
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={LOGO_TYPES.join(",")}
            className="sr-only"
            aria-label={t("upload")}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button variant="secondary" loading={pending} onClick={() => inputRef.current?.click()}>
            {logoUrl ? t("replace") : t("upload")}
          </Button>
          {logoUrl ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await removeLogo();
                  toast.success(t("removed"));
                  router.refresh();
                })
              }
            >
              <Trash2 /> {t("remove")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function PreferencesForm({ defaults }: { defaults: PreferencesInput }) {
  const t = useTranslations("app.settings");
  const tc = useTranslations("app.common");
  const tl = useTranslations("common.languages");
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale();
  const [pending, start] = useTransition();
  const form = useForm<PreferencesInput>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: defaults,
  });

  return (
    <Card>
      <form
        onSubmit={form.handleSubmit((values) =>
          start(async () => {
            const res = await updatePreferences(values);
            if (!res.ok) return void toast.error(t("error"));
            toast.success(t("preferences.saved"));
            form.reset(values);
            if (values.locale !== currentLocale)
              router.replace(pathname as "/app/settings", { locale: values.locale });
            else router.refresh();
          }),
        )}
      >
        <CardHeader>
          <CardTitle>{t("preferences.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <FormField id="pref-locale" label={t("preferences.language")}>
            <NativeSelect id="pref-locale" className="sm:max-w-xs" {...form.register("locale")}>
              <option value="es">{tl("es")}</option>
              <option value="en">{tl("en")}</option>
            </NativeSelect>
          </FormField>
          {(["notifyOnView", "notifyOnComplete"] as const).map((name) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor={`pref-${name}`} className="text-sm">
                    {t(
                      name === "notifyOnView"
                        ? "preferences.notifyView"
                        : "preferences.notifyComplete",
                    )}
                  </label>
                  <Switch
                    id={`pref-${name}`}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />
          ))}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={pending} disabled={!form.formState.isDirty}>
            {tc("save")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const t = useTranslations("app.settings.password");
  const ta = useTranslations("auth");
  const te = useTranslateError();
  const [pending, start] = useTransition();
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const errors = form.formState.errors;
  return (
    <Card>
      <form
        noValidate
        onSubmit={form.handleSubmit((values) =>
          start(async () => {
            const res = await changePassword(values);
            if (!res.ok) return void toast.error(ta(`errors.${res.error}` as "errors.generic"));
            toast.success(t("saved"));
            form.reset();
          }),
        )}
      >
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <FormField id="pw-new" label={t("new")} error={te(errors.password?.message)}>
            <PasswordInput
              id="pw-new"
              autoComplete="new-password"
              showLabel={ta("showPassword")}
              hideLabel={ta("hidePassword")}
              aria-invalid={!!errors.password}
              {...form.register("password")}
            />
          </FormField>
          <FormField id="pw-confirm" label={t("confirm")} error={te(errors.confirm?.message)}>
            <PasswordInput
              id="pw-confirm"
              autoComplete="new-password"
              showLabel={ta("showPassword")}
              hideLabel={ta("hidePassword")}
              aria-invalid={!!errors.confirm}
              {...form.register("confirm")}
            />
          </FormField>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={pending}>
            {t("submit")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function DeleteAccount({ email }: { email: string }) {
  const t = useTranslations("app.settings.danger");
  const ts = useTranslations("app.settings");
  const tc = useTranslations("app.common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <Card className="border-danger/30">
      <CardHeader>
        <CardTitle className="text-danger">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardFooter className="justify-end border-danger/15">
        <Button variant="danger-outline" onClick={() => setOpen(true)}>
          {t("button")}
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("confirmTitle")}
        description={t("confirmBody", { email })}
        confirmLabel={t("confirm")}
        cancelLabel={tc("cancel")}
        destructive
        pending={pending}
        onConfirm={() =>
          start(async () => {
            if (value.trim().toLowerCase() !== email.toLowerCase()) return setError(t("mismatch"));
            const res = await deleteAccount(value, locale);
            if (res && !res.ok) setError(res.error === "mismatch" ? t("mismatch") : ts("error"));
          })
        }
      >
        <FormField id="del-email" label={t("confirmLabel")} error={error}>
          <Input
            id="del-email"
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
          />
        </FormField>
      </ConfirmDialog>
    </Card>
  );
}
