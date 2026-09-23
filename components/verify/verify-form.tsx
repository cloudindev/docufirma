"use client";

import { CheckCircle2, Download, FileSearch, SearchX, UploadCloud } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { VerificationResult } from "@/lib/verification";

const CODE_RE = /^DF-?[0-9A-Z]{4}-?[0-9A-Z]{4}$/;

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function Hash({ value }: { value: string }) {
  return <code className="block font-mono text-xs break-all text-ink-muted">{value}</code>;
}

export function VerifyForm({ initialCode }: { initialCode?: string }) {
  const t = useTranslations("verify");
  const format = useFormatter();
  const [code, setCode] = useState(initialCode ?? "");
  const [hash, setHash] = useState<string>();
  const [hashing, setHashing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const run = useCallback(
    (query: string) =>
      start(async () => {
        setError(undefined);
        setResult(null);
        try {
          const res = await fetch(`/api/verify/${encodeURIComponent(query)}`, {
            cache: "no-store",
          });
          if (res.status === 429) return setError(t("rateLimited"));
          if (res.status >= 500) return setError(t("error"));
          setResult((await res.json()) as VerificationResult);
          requestAnimationFrame(() => resultRef.current?.focus());
        } catch {
          setError(t("error"));
        }
      }),
    [t],
  );

  useEffect(() => {
    if (initialCode && CODE_RE.test(initialCode.toUpperCase())) run(initialCode.toUpperCase());
  }, [initialCode, run]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setHashing(true);
    setHash(undefined);
    try {
      const h = await sha256Hex(file);
      setHash(h);
      run(h);
    } finally {
      setHashing(false);
    }
  };

  const dateTime = (iso: string | null) =>
    iso
      ? format.dateTime(new Date(iso), {
          dateStyle: "long",
          timeStyle: "medium",
          timeZone: "UTC",
        }) + " UTC"
      : "—";

  return (
    <div className="space-y-8">
      <Card className="p-6 sm:p-8">
        <Tabs defaultValue="code" onValueChange={() => setResult(null)}>
          <TabsList className="mb-6 w-full [&>button]:flex-1">
            <TabsTrigger value="code">{t("tabCode")}</TabsTrigger>
            <TabsTrigger value="file">{t("tabFile")}</TabsTrigger>
          </TabsList>
          <TabsContent value="code">
            <form
              className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                const value = code.trim().toUpperCase();
                if (!CODE_RE.test(value)) return setError(t("invalidCode"));
                run(value);
              }}
            >
              <FormField id="verify-code" label={t("codeLabel")} hint={t("codeHint")}>
                <Input
                  id="verify-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder={t("codePlaceholder")}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono tracking-wider uppercase"
                  maxLength={14}
                />
              </FormField>
              <Button type="submit" size="lg" loading={pending} className="sm:mb-7">
                {t("submit")}
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="file">
            <label
              htmlFor="verify-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void onFile(e.dataTransfer.files[0]);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-bg-soft px-6 py-12 text-center transition-colors hover:border-primary/50",
                dragOver && "border-primary bg-bg-tint",
              )}
            >
              {hashing ? (
                <Spinner className="size-8 text-primary" />
              ) : (
                <UploadCloud className="size-8 text-primary" strokeWidth={1.75} aria-hidden />
              )}
              <span className="font-medium">{hashing ? t("hashing") : t("fileLabel")}</span>
              <span className="max-w-sm text-sm text-ink-muted">{t("fileHint")}</span>
              <input
                ref={fileRef}
                id="verify-file"
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
            {hash ? (
              <div className="mt-4 space-y-1">
                <p className="text-xs font-medium text-ink-muted">{t("fileHash")}</p>
                <Hash value={hash} />
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
        {error ? (
          <Alert variant="danger" className="mt-5">
            {error}
          </Alert>
        ) : null}
      </Card>

      <div ref={resultRef} tabIndex={-1} aria-live="polite" className="outline-none">
        {pending && !result ? (
          <div className="flex justify-center py-6">
            <Spinner className="size-6 text-primary" label={t("submit")} />
          </div>
        ) : null}
        {result && !result.valid ? (
          <Card className="flex gap-4 p-6">
            <SearchX className="size-7 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
            <div className="space-y-1">
              <h2 className="text-lg">{t("result.notFoundTitle")}</h2>
              <p className="text-ink-muted">{t("result.notFoundBody")}</p>
            </div>
          </Card>
        ) : null}
        {result && result.valid ? (
          <Card className="overflow-hidden">
            <div className="flex gap-4 border-b border-border bg-success/6 p-6">
              <CheckCircle2
                className="size-7 shrink-0 text-success"
                strokeWidth={1.75}
                aria-hidden
              />
              <div className="space-y-1">
                <h2 className="text-lg">{t("result.validTitle")}</h2>
                <p className="text-ink-muted">
                  {result.artifacts.some((a) => a.matched)
                    ? t("result.matchBody")
                    : t("result.validBody")}
                </p>
              </div>
            </div>
            <dl className="grid gap-5 p-6 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-ink-muted">{t("result.document")}</dt>
                <dd className="mt-1 font-medium break-words">{result.title}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-muted">{t("result.code")}</dt>
                <dd className="mt-1 font-mono">{result.code}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-muted">{t("result.completedAt")}</dt>
                <dd className="mt-1">{dateTime(result.completedAt)}</dd>
              </div>
            </dl>
            <div className="border-t border-border p-6">
              <h3 className="mb-3 text-sm font-semibold">{t("result.signers")}</h3>
              <ul className="space-y-2">
                {result.signers.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-ink-muted">
                      {t("result.signedAt", { date: dateTime(s.signedAt) })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-border p-6">
              <h3 className="mb-4 text-sm font-semibold">{t("result.artifacts")}</h3>
              <ul className="space-y-4">
                {result.artifacts.map((a) => (
                  <li key={a.id} className="space-y-3 rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-medium">
                        <FileSearch className="size-4 text-primary" aria-hidden />
                        {a.kind === "evidence" ? t("result.evidence") : a.name}
                      </span>
                      {a.matched ? (
                        <Badge variant="success" dot>
                          {t("result.matched")}
                        </Badge>
                      ) : null}
                    </div>
                    {a.originalSha256 ? (
                      <div>
                        <p className="text-xs text-ink-muted">{t("result.originalHash")}</p>
                        <Hash value={a.originalSha256} />
                      </div>
                    ) : null}
                    <div>
                      <p className="text-xs text-ink-muted">{t("result.signedHash")}</p>
                      <Hash value={a.signedSha256} />
                    </div>
                    {a.tsa.status === "granted" ? (
                      <dl className="grid gap-3 rounded-lg bg-bg-soft p-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs text-ink-muted">{t("result.tsaAuthority")}</dt>
                          <dd className="break-words">{a.tsa.authority ?? a.tsa.provider}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-muted">{t("result.tsaDate")}</dt>
                          <dd>{dateTime(a.tsa.genTime)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-muted">{t("result.tsaSerial")}</dt>
                          <dd className="font-mono text-xs break-all">{a.tsa.serial}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-muted">{t("result.tsaPolicy")}</dt>
                          <dd className="font-mono text-xs">{a.tsa.policyOid}</dd>
                        </div>
                      </dl>
                    ) : (
                      <Badge variant="warning" dot>
                        {a.tsa.status === "failed" ? t("result.tsaFailed") : t("result.tsaPending")}
                      </Badge>
                    )}
                    {a.tsa.tsrAvailable ? (
                      <Button asChild variant="secondary" size="sm">
                        <a
                          href={`/api/verify/${encodeURIComponent(result.code)}/tsr?artifact=${a.id}`}
                          download
                        >
                          <Download /> {t("result.downloadTsr")}
                        </a>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <details className="mt-5 text-sm">
                <summary className="cursor-pointer font-medium text-primary">
                  {t("result.howTo")}
                </summary>
                <p className="mt-2 font-mono text-xs break-words text-ink-muted">
                  {t("result.howToBody")}
                </p>
              </details>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
