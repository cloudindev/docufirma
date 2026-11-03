"use client";

import { Check, Copy, Eye, EyeOff, KeyRound, Plus, Send, Trash2, Webhook } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  createApiKey,
  deleteWebhook,
  revokeApiKey,
  rotateWebhookSecret,
  saveWebhook,
  testWebhook,
} from "@/app/[locale]/app/(shell)/settings/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { Link, useRouter } from "@/lib/i18n/navigation";

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};
export type WebhookState = {
  url: string;
  enabled: boolean;
  secret: string;
  lastDeliveryAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
} | null;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check /> : <Copy />} {label}
    </Button>
  );
}

function ApiKeys({ keys }: { keys: ApiKeyRow[] }) {
  const t = useTranslations("app.settings.api");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyRow | null>(null);
  const date = (iso: string | null) => (iso ? format.dateTime(new Date(iso), "short") : t("never"));

  return (
    <section aria-labelledby="api-keys-title" className="space-y-4">
      <h3 id="api-keys-title" className="flex items-center gap-2 text-base">
        <KeyRound className="size-4.5 text-primary" strokeWidth={1.75} aria-hidden />{" "}
        {t("keys.title")}
      </h3>
      {created ? (
        <Alert variant="success" className="space-y-3">
          <p className="font-medium">{t("keys.createdTitle")}</p>
          <p className="text-sm">{t("keys.createdBody")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="api-key-value"
              readOnly
              value={created}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
              aria-label={t("keys.createdTitle")}
            />
            <CopyButton value={created} label={t("copy")} />
          </div>
        </Alert>
      ) : null}
      {keys.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
              <div className="min-w-0">
                <p className="font-medium">{k.name}</p>
                <p className="font-mono text-xs text-ink-muted">{k.prefix}…</p>
                <p className="text-xs text-ink-muted">
                  {t("keys.meta", { created: date(k.createdAt), used: date(k.lastUsedAt) })}
                </p>
              </div>
              <Button
                type="button"
                variant="danger-outline"
                size="sm"
                onClick={() => setRevoking(k)}
                aria-label={t("keys.revokeLabel", { name: k.name })}
              >
                <Trash2 /> {t("keys.revoke")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">{t("keys.empty")}</p>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await createApiKey(name);
            if (!res.ok)
              return void toast.error(t(res.error === "too_many_keys" ? "keys.tooMany" : "error"));
            setCreated(res.data.key);
            setName("");
            router.refresh();
          });
        }}
      >
        <FormField id="api-key-name" label={t("keys.name")} className="flex-1">
          <Input
            id="api-key-name"
            value={name}
            maxLength={60}
            placeholder={t("keys.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <Button type="submit" loading={pending} disabled={!name.trim()}>
          <Plus /> {t("keys.create")}
        </Button>
      </form>
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={t("keys.revokeTitle")}
        description={t("keys.revokeBody", { name: revoking?.name ?? "" })}
        confirmLabel={t("keys.revoke")}
        cancelLabel={t("cancel")}
        pending={pending}
        destructive
        onConfirm={() =>
          start(async () => {
            if (!revoking) return;
            const res = await revokeApiKey(revoking.id);
            if (!res.ok) return void toast.error(t("error"));
            toast.success(t("keys.revoked"));
            setRevoking(null);
            router.refresh();
          })
        }
      />
    </section>
  );
}

function WebhookForm({ webhook }: { webhook: WebhookState }) {
  const t = useTranslations("app.settings.api");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState(webhook?.url ?? "");
  const [enabled, setEnabled] = useState(webhook?.enabled ?? true);
  const [reveal, setReveal] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) => start(fn);

  return (
    <section aria-labelledby="webhook-title" className="space-y-4">
      <div>
        <h3 id="webhook-title" className="flex items-center gap-2 text-base">
          <Webhook className="size-4.5 text-primary" strokeWidth={1.75} aria-hidden />{" "}
          {t("webhook.title")}
        </h3>
        <p className="text-sm text-ink-muted">{t("webhook.subtitle")}</p>
      </div>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            setUrlError(null);
            const res = await saveWebhook({ url, enabled });
            if (!res.ok) {
              if (res.error === "webhook_url")
                return setUrlError(
                  t(
                    `webhook.urlErrors.${res.fieldErrors?.url ?? "invalid_url"}` as "webhook.urlErrors.invalid_url",
                  ),
                );
              return void toast.error(t("error"));
            }
            toast.success(t("webhook.saved"));
            router.refresh();
          });
        }}
      >
        <FormField
          id="wh-url"
          label={t("webhook.url")}
          hint={t("webhook.urlHint")}
          error={urlError ?? undefined}
        >
          <Input
            id="wh-url"
            type="url"
            inputMode="url"
            placeholder="https://example.com/webhooks/docufirma"
            value={url}
            aria-invalid={!!urlError}
            onChange={(e) => setUrl(e.target.value)}
          />
        </FormField>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="wh-enabled" className="text-sm">
            {t("webhook.enabled")}
          </label>
          <Switch id="wh-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {webhook ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const res = await testWebhook();
                    if (res.ok)
                      toast.success(t("webhook.testOk", { status: res.data.status ?? 0 }));
                    else toast.error(t("webhook.testFailed"));
                    router.refresh();
                  })
                }
              >
                <Send /> {t("webhook.test")}
              </Button>
              <Button
                type="button"
                variant="danger-outline"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    await deleteWebhook();
                    setUrl("");
                    toast.success(t("webhook.deleted"));
                    router.refresh();
                  })
                }
              >
                <Trash2 /> {t("webhook.delete")}
              </Button>
            </>
          ) : null}
          <Button type="submit" loading={pending} disabled={!url.trim()}>
            {t("webhook.save")}
          </Button>
        </div>
      </form>
      {webhook ? (
        <div className="space-y-2 rounded-xl bg-bg-soft p-4">
          <p className="text-sm font-medium">{t("webhook.secret")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="wh-secret"
              readOnly
              aria-label={t("webhook.secret")}
              className="font-mono text-xs"
              value={reveal ? webhook.secret : `${webhook.secret.slice(0, 9)}${"•".repeat(24)}`}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setReveal((v) => !v)}
              >
                {reveal ? <EyeOff /> : <Eye />} {t(reveal ? "hide" : "show")}
              </Button>
              <CopyButton value={webhook.secret} label={t("copy")} />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const res = await rotateWebhookSecret();
                    if (!res.ok) return void toast.error(t("error"));
                    toast.success(t("webhook.rotated"));
                    router.refresh();
                  })
                }
              >
                {t("webhook.rotate")}
              </Button>
            </div>
          </div>
          <p className="text-xs text-ink-muted">
            {webhook.lastDeliveryAt
              ? webhook.lastError
                ? t("webhook.lastFailed", {
                    date: format.dateTime(new Date(webhook.lastDeliveryAt), "short"),
                    error: webhook.lastError,
                  })
                : t("webhook.lastOk", {
                    date: format.dateTime(new Date(webhook.lastDeliveryAt), "short"),
                    status: webhook.lastStatus ?? 0,
                  })
              : t("webhook.noDeliveries")}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function ApiAccessCard({
  hasPlan,
  keys,
  webhook,
}: {
  hasPlan: boolean;
  keys: ApiKeyRow[];
  webhook: WebhookState;
}) {
  const t = useTranslations("app.settings.api");
  return (
    <Card id="api">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("subtitle")}{" "}
          <Link
            href="/developers"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("docs")}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8">
        {hasPlan ? (
          <>
            <ApiKeys keys={keys} />
            <WebhookForm webhook={webhook} />
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg-soft p-4">
            <p className="text-sm">{t("noPlan")}</p>
            <Button asChild size="sm">
              <Link href="/app/billing">{t("noPlanCta")}</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
