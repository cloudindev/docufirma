"use client";

import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, Trash2, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import {
  finalizeUpload,
  getDocumentPreviewUrl,
  removeDocument,
  reorderDocuments,
  requestUpload,
} from "@/app/[locale]/app/(shell)/send/actions";
import { PdfThumbnail } from "@/components/pdf/pdf-thumbnail";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { LIMITS } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { cn, formatBytes } from "@/lib/utils";
import type { WizardDocument } from "./types";

type Pending = { key: string; name: string; phase: "uploading" | "processing" };
type UploadError = { key: string; name: string; error: string };

const BASE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function DocumentsStep({
  envelopeId,
  onEnvelopeCreated,
  documents,
  setDocuments,
  docxEnabled,
  onContinue,
}: {
  envelopeId: string | null;
  onEnvelopeCreated: (id: string) => void;
  documents: WizardDocument[];
  setDocuments: (updater: (docs: WizardDocument[]) => WizardDocument[]) => void;
  docxEnabled: boolean;
  onContinue: () => void;
}) {
  const t = useTranslations("send.documents");
  const inputRef = useRef<HTMLInputElement>(null);
  const envelopeRef = useRef<string | null>(envelopeId);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [errors, setErrors] = useState<UploadError[]>([]);
  const seq = useRef(0);

  const accepted = docxEnabled ? [...BASE_TYPES, DOCX] : BASE_TYPES;
  const busy = pending.length > 0;

  const addError = (name: string, error: string) =>
    setErrors((e) => [...e, { key: `err-${(seq.current += 1)}`, name, error }]);

  const errorText = (code: string) =>
    t.has(`errors.${code}` as "errors.generic")
      ? t(`errors.${code}` as "errors.generic")
      : t("errors.generic");

  async function uploadOne(file: File) {
    const isDocx = file.name.toLowerCase().endsWith(".docx");
    if (!accepted.includes(file.type) && !(docxEnabled && isDocx))
      return addError(file.name, isDocx ? "docx_disabled" : "unsupported");
    if (file.size > LIMITS.maxFileBytes) return addError(file.name, "too_large");

    const key = `up-${(seq.current += 1)}`;
    setPending((p) => [...p, { key, name: file.name, phase: "uploading" }]);
    try {
      const slot = await requestUpload({
        envelopeId: envelopeRef.current ?? undefined,
        fileName: file.name,
        size: file.size,
        type: file.type,
      });
      if (!slot.ok) return addError(file.name, slot.error);
      if (!envelopeRef.current) {
        envelopeRef.current = slot.data.envelopeId;
        onEnvelopeCreated(slot.data.envelopeId);
      }
      const { error } = await createClient()
        .storage.from("originals")
        .uploadToSignedUrl(slot.data.uploadPath, slot.data.token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (error) return addError(file.name, "generic");

      setPending((p) => p.map((x) => (x.key === key ? { ...x, phase: "processing" } : x)));
      const doc = await finalizeUpload({
        envelopeId: slot.data.envelopeId,
        uploadPath: slot.data.uploadPath,
        fileName: file.name,
      });
      if (!doc.ok) return addError(file.name, doc.error);
      setDocuments((docs) => [...docs, doc.data]);
    } catch {
      addError(file.name, "generic");
    } finally {
      setPending((p) => p.filter((x) => x.key !== key));
    }
  }

  async function handleFiles(list: FileList | File[]) {
    setErrors([]);
    const files = Array.from(list);
    const room = LIMITS.maxDocumentsPerEnvelope - documents.length - pending.length;
    files.slice(room).forEach((f) => addError(f.name, "too_many_documents"));
    // Sequential: keeps the upload order and creates the draft only once.
    for (const file of files.slice(0, Math.max(0, room))) await uploadOne(file);
  }

  const move = (index: number, delta: -1 | 1) => {
    const next = [...documents];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setDocuments(() => next);
    if (envelopeRef.current)
      void reorderDocuments(
        envelopeRef.current,
        next.map((d) => d.id),
      );
  };

  const remove = (doc: WizardDocument) => {
    setDocuments((docs) => docs.filter((d) => d.id !== doc.id));
    if (envelopeRef.current) void removeDocument(envelopeRef.current, doc.id);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl sm:text-2xl">{t("title")}</h2>
        <p className="text-ink-muted">
          {t("subtitle", { docx: String(docxEnabled), max: LIMITS.maxDocumentsPerEnvelope })}
        </p>
      </header>

      <label
        htmlFor="wizard-files"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-bg px-6 py-12 text-center transition-colors hover:border-primary/50 hover:bg-bg-soft",
          dragOver && "border-primary bg-bg-tint",
          documents.length >= LIMITS.maxDocumentsPerEnvelope && "pointer-events-none opacity-50",
        )}
      >
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-bg-tint text-primary">
          <UploadCloud className="size-7" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="text-base font-medium">{dragOver ? t("dropActive") : t("drop")}</span>
        <span className="text-sm text-ink-muted">{t("or")}</span>
        <span className="inline-flex h-10 items-center rounded-full border border-border bg-bg px-5 text-sm font-medium">
          {t("browse")}
        </span>
        <input
          ref={inputRef}
          id="wizard-files"
          type="file"
          multiple
          accept={[...accepted, ...(docxEnabled ? [".docx"] : [])].join(",")}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {errors.length > 0 ? (
        <div className="space-y-2" aria-live="polite">
          {errors.map((e) => (
            <Alert key={e.key} variant="danger" title={e.name}>
              {errorText(e.error)}
            </Alert>
          ))}
        </div>
      ) : null}

      {documents.length > 0 || pending.length > 0 ? (
        <ul className="space-y-3" aria-live="polite">
          {documents.map((doc, i) => (
            <li key={doc.id}>
              <Card className="flex items-center gap-4 p-3 pr-4">
                <PdfThumbnail
                  cacheKey={doc.id}
                  label={t("preview", { name: doc.name })}
                  className="h-20 w-16 shrink-0"
                  getUrl={async () => {
                    if (!envelopeRef.current) return null;
                    const res = await getDocumentPreviewUrl(envelopeRef.current, doc.id);
                    return res.ok ? res.data.url : null;
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{doc.name}</p>
                  <p className="text-sm text-ink-muted">
                    {t("pages", { count: doc.pageCount })} · {formatBytes(doc.sizeBytes)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={i === 0 || busy}
                    aria-label={t("moveUp", { name: doc.name })}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={i === documents.length - 1 || busy}
                    aria-label={t("moveDown", { name: doc.name })}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label={t("remove", { name: doc.name })}
                    onClick={() => remove(doc)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
          {pending.map((p) => (
            <li key={p.key}>
              <Card className="flex items-center gap-4 p-3 pr-4">
                <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg bg-bg-soft">
                  <Spinner className="text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-sm text-ink-muted">
                    {p.phase === "uploading" ? t("uploading") : t("processing")}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        {documents.length === 0 && !busy ? (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <AlertCircle className="size-4" aria-hidden /> {t("empty")}
          </p>
        ) : null}
        <Button size="lg" disabled={documents.length === 0 || busy} onClick={onContinue}>
          {t("continue")} <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
