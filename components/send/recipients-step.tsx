"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Trash2, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { Controller, type UseFormReturn, useFieldArray, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS } from "@/lib/config";
import { Link } from "@/lib/i18n/navigation";
import {
  EXPIRY_OPTIONS,
  type EnvelopeSettingsInput,
  REMINDER_OPTIONS,
} from "@/lib/envelopes/schemas";
import { useTranslateError } from "@/lib/hooks/use-translate-error";
import { cn } from "@/lib/utils";
import type { WizardContact } from "./types";

type Form = UseFormReturn<EnvelopeSettingsInput>;

function ContactSuggestions({
  query,
  exclude,
  contacts,
  onPick,
  listId,
  active,
  setActive,
}: {
  query: string;
  exclude: Set<string>;
  contacts: WizardContact[];
  onPick: (c: WizardContact) => void;
  listId: string;
  active: number;
  setActive: (n: number) => void;
}) {
  const t = useTranslations("send.recipients");
  const q = query.trim().toLowerCase();
  const matches = contacts
    .filter((c) => !exclude.has(c.email.toLowerCase()))
    .filter((c) => !q || `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q))
    .slice(0, 5);
  if (matches.length === 0) return null;
  return (
    <ul
      id={listId}
      role="listbox"
      aria-label={t("suggestions")}
      className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-xl border border-border bg-bg p-1 shadow-card-hover"
    >
      {matches.map((c, i) => (
        <li
          key={c.email}
          role="option"
          aria-selected={i === active}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(c);
          }}
          onMouseEnter={() => setActive(i)}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm",
            i === active && "bg-bg-soft",
          )}
        >
          <UserRound className="size-4 shrink-0 text-ink-muted" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {c.first_name} {c.last_name}
            </span>
            <span className="block truncate text-xs text-ink-muted">{c.email}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function SignerRow({
  form,
  index,
  count,
  contacts,
  onRemove,
  onMove,
  sequential,
  smsAvailable,
  smsBalance,
}: {
  form: Form;
  index: number;
  count: number;
  contacts: WizardContact[];
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
  sequential: boolean;
  smsAvailable: boolean;
  smsBalance: number;
}) {
  const t = useTranslations("send.recipients");
  const te = useTranslateError();
  const listId = useId();
  const [open, setOpen] = useState<"firstName" | "email" | null>(null);
  const [active, setActive] = useState(0);
  const watchedSigners = useWatch({ control: form.control, name: "signers" });
  const signers = useMemo(() => watchedSigners ?? [], [watchedSigners]);
  const current = signers[index];
  const exclude = useMemo(
    () => new Set(signers.map((s) => s?.email?.toLowerCase()).filter(Boolean) as string[]),
    [signers],
  );
  const errors = form.formState.errors.signers?.[index];

  const pick = (c: WizardContact) => {
    form.setValue(`signers.${index}.firstName`, c.first_name, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue(`signers.${index}.lastName`, c.last_name, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue(`signers.${index}.email`, c.email, { shouldDirty: true, shouldValidate: true });
    setOpen(null);
  };

  const keyNav = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, 4));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(null);
    } else if (e.key === "Enter") {
      const q = (open === "email" ? current?.email : current?.firstName) ?? "";
      const matches = contacts
        .filter((c) => !exclude.has(c.email.toLowerCase()))
        .filter((c) =>
          `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q.toLowerCase()),
        );
      if (matches[active]) {
        e.preventDefault();
        pick(matches[active]);
      }
    }
  };

  const suggestionProps = (field: "firstName" | "email") => ({
    role: "combobox" as const,
    "aria-expanded": open === field,
    "aria-controls": open === field ? listId : undefined,
    "aria-autocomplete": "list" as const,
    onFocus: () => {
      setActive(0);
      setOpen(field);
    },
    onKeyDown: keyNav,
  });

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-bg-tint text-xs text-primary">
            {index + 1}
          </span>
          {t("signer", { n: index + 1 })}
        </p>
        <div className="flex gap-1">
          {sequential && count > 1 ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={index === 0}
                aria-label={t("moveUp", { n: index + 1 })}
                onClick={() => onMove(-1)}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={index === count - 1}
                aria-label={t("moveDown", { n: index + 1 })}
                onClick={() => onMove(1)}
              >
                <ArrowDown />
              </Button>
            </>
          ) : null}
          {count > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("remove", { n: index + 1 })}
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_1.3fr]">
        <FormField
          id={`s-${index}-first`}
          label={t("firstName")}
          error={te(errors?.firstName?.message)}
        >
          <div className="relative">
            <Input
              id={`s-${index}-first`}
              autoComplete="off"
              aria-invalid={!!errors?.firstName}
              {...form.register(`signers.${index}.firstName`, { onBlur: () => setOpen(null) })}
              {...suggestionProps("firstName")}
            />
            {open === "firstName" && (current?.firstName ?? "").length > 0 ? (
              <ContactSuggestions
                query={current?.firstName ?? ""}
                exclude={exclude}
                contacts={contacts}
                onPick={pick}
                listId={listId}
                active={active}
                setActive={setActive}
              />
            ) : null}
          </div>
        </FormField>
        <FormField
          id={`s-${index}-last`}
          label={t("lastName")}
          error={te(errors?.lastName?.message)}
        >
          <Input
            id={`s-${index}-last`}
            autoComplete="off"
            aria-invalid={!!errors?.lastName}
            {...form.register(`signers.${index}.lastName`)}
          />
        </FormField>
        <FormField id={`s-${index}-email`} label={t("email")} error={te(errors?.email?.message)}>
          <div className="relative">
            <Input
              id={`s-${index}-email`}
              type="email"
              inputMode="email"
              autoComplete="off"
              aria-invalid={!!errors?.email}
              {...form.register(`signers.${index}.email`, { onBlur: () => setOpen(null) })}
              {...suggestionProps("email")}
            />
            {open === "email" ? (
              <ContactSuggestions
                query={current?.email ?? ""}
                exclude={exclude}
                contacts={contacts}
                onPick={pick}
                listId={listId}
                active={active}
                setActive={setActive}
              />
            ) : null}
          </div>
        </FormField>
      </div>
      <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-[1fr_1.3fr]">
        <FormField
          id={`s-${index}-phone`}
          label={t("phone")}
          hint={t("phoneHint")}
          error={te(errors?.phone?.message)}
        >
          <Input
            id={`s-${index}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="600 123 456"
            aria-invalid={!!errors?.phone}
            {...form.register(`signers.${index}.phone`)}
          />
        </FormField>
        <div className="space-y-3">
          <Controller
            control={form.control}
            name={`signers.${index}.delivery`}
            render={({ field }) => (
              <div className="flex items-start gap-3">
                <Switch
                  id={`s-${index}-in-person`}
                  checked={field.value === "in_person"}
                  onCheckedChange={(on) => field.onChange(on ? "in_person" : "email")}
                  className="mt-0.5"
                />
                <label htmlFor={`s-${index}-in-person`} className="text-sm">
                  <span className="font-medium">{t("inPerson")}</span>
                  <span className="block text-xs text-ink-muted">{t("inPersonHint")}</span>
                </label>
              </div>
            )}
          />
          <Controller
            control={form.control}
            name={`signers.${index}.requireSmsOtp`}
            render={({ field }) => (
              <div className="flex items-start gap-3">
                <Switch
                  id={`s-${index}-sms`}
                  checked={Boolean(field.value)}
                  disabled={!smsAvailable || (smsBalance <= 0 && !field.value)}
                  onCheckedChange={(on) => {
                    field.onChange(on);
                    void form.trigger(`signers.${index}.phone`);
                  }}
                  className="mt-0.5"
                />
                <label htmlFor={`s-${index}-sms`} className="text-sm">
                  <span className="font-medium">{t("smsOtp")}</span>
                  <span className="block text-xs text-ink-muted">
                    {!smsAvailable ? (
                      t("smsOtpUnavailable")
                    ) : smsBalance <= 0 ? (
                      t.rich("smsOtpNoCredits", {
                        link: (chunks) => (
                          <Link
                            href={{ pathname: "/app/billing", hash: "sms" }}
                            className="text-brand font-medium underline-offset-2 hover:underline"
                          >
                            {chunks}
                          </Link>
                        ),
                      })
                    ) : (
                      <>
                        {t("smsOtpHint")} {t("smsOtpBalance", { count: smsBalance })}
                      </>
                    )}
                  </span>
                </label>
              </div>
            )}
          />
        </div>
      </div>
    </Card>
  );
}

export function RecipientsStep({
  form,
  contacts,
  smsAvailable,
  smsBalance,
  onBack,
  onContinue,
}: {
  form: Form;
  contacts: WizardContact[];
  smsAvailable: boolean;
  smsBalance: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  const t = useTranslations("send.recipients");
  const tl = useTranslations("common.languages");
  const tc = useTranslations("common");
  const te = useTranslateError();
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "signers",
  });
  const sequential = useWatch({ control: form.control, name: "sequential" });
  const errors = form.formState.errors;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h2 className="text-xl sm:text-2xl">{t("title")}</h2>
        <p className="text-ink-muted">{t("subtitle")}</p>
      </header>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <SignerRow
            key={field.id}
            form={form}
            index={index}
            count={fields.length}
            contacts={contacts}
            sequential={Boolean(sequential)}
            smsAvailable={smsAvailable}
            smsBalance={smsBalance}
            onRemove={() => remove(index)}
            onMove={(delta) => move(index, index + delta)}
          />
        ))}
        {errors.signers?.message || errors.signers?.root?.message ? (
          <p role="alert" className="text-sm text-danger">
            {te(errors.signers?.message ?? errors.signers?.root?.message)}
          </p>
        ) : null}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="secondary"
            disabled={fields.length >= LIMITS.maxSignersPerEnvelope}
            onClick={() =>
              append(
                {
                  firstName: "",
                  lastName: "",
                  email: "",
                  phone: "",
                  requireSmsOtp: false,
                  delivery: "email",
                },
                { shouldFocus: true },
              )
            }
          >
            <Plus /> {t("add")}
          </Button>
          {fields.length > 1 ? (
            <Controller
              control={form.control}
              name="sequential"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <Switch
                    id="w-sequential"
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                  />
                  <label htmlFor="w-sequential" className="text-sm">
                    <span className="font-medium">{t("sequential")}</span>
                    <span className="block text-xs text-ink-muted">{t("sequentialHint")}</span>
                  </label>
                </div>
              )}
            />
          ) : null}
        </div>
      </div>

      <Card className="grid gap-5 p-5 sm:p-6">
        <FormField id="w-title" label={t("envelopeTitle")} error={te(errors.title?.message)}>
          <Input id="w-title" aria-invalid={!!errors.title} {...form.register("title")} />
        </FormField>
        <FormField
          id="w-message"
          label={t("message")}
          optionalLabel={tc("optional")}
          error={te(errors.message?.message)}
        >
          <Textarea
            id="w-message"
            rows={3}
            placeholder={t("messagePlaceholder")}
            {...form.register("message")}
          />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-3">
          <FormField id="w-expiry" label={t("expiry")}>
            <NativeSelect id="w-expiry" {...form.register("expiryDays", { valueAsNumber: true })}>
              {EXPIRY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {t("expiryOption", { days: d })}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="w-reminders" label={t("reminders")}>
            <NativeSelect
              id="w-reminders"
              {...form.register("reminderDays", { valueAsNumber: true })}
            >
              {REMINDER_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? t("remindersOff") : t("remindersOption", { days: d })}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="w-locale" label={t("locale")}>
            <NativeSelect id="w-locale" {...form.register("locale")}>
              <option value="es">{tl("es")}</option>
              <option value="en">{tl("en")}</option>
            </NativeSelect>
          </FormField>
        </div>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft /> {t("back")}
        </Button>
        <Button type="button" size="lg" onClick={onContinue}>
          {t("continue")} <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
