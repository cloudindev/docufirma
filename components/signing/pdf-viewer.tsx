"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { loadPdfjs } from "@/lib/pdf/pdfjs-client";
import { cn } from "@/lib/utils";

const ZOOMS = [0.75, 1, 1.25, 1.5, 2] as const;

function PdfPage({
  doc,
  index,
  width,
  aspect,
  root,
  onVisible,
}: {
  doc: PDFDocumentProxy;
  index: number;
  width: number;
  aspect: number;
  root: HTMLElement | null;
  onVisible: (page: number) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [ratio, setRatio] = useState(aspect);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setNear(true);
        }
      },
      { root, rootMargin: "800px 0px" },
    );
    const visible = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && onVisible(index + 1)),
      { root, threshold: 0.5 },
    );
    io.observe(el);
    visible.observe(el);
    return () => {
      io.disconnect();
      visible.disconnect();
    };
  }, [root, index, onVisible]);

  useEffect(() => {
    if (!near || width <= 0) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      const page = await doc.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      if (cancelled) return;
      setRatio(base.height / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const c = canvas.current;
      if (!c) return;
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      task = page.render({ canvas: c, viewport });
      await task.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, width, doc, index]);

  return (
    <div
      ref={holder}
      className="mx-auto overflow-hidden rounded-md bg-white shadow-[0_1px_3px_rgba(11,27,63,0.12)]"
      style={{ width, height: width * ratio }}
    >
      {near ? <canvas ref={canvas} className="block h-full w-full" /> : null}
    </div>
  );
}

export function PdfViewer({
  url,
  name,
  onReachedEnd,
  className,
}: {
  url: string;
  name: string;
  onReachedEnd?: () => void;
  className?: string;
}) {
  const t = useTranslations("signing.viewer");
  const scroller = useRef<HTMLDivElement | null>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [aspect, setAspect] = useState(1.414);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(1);
  const [current, setCurrent] = useState(1);
  const endRef = useRef(onReachedEnd);
  useEffect(() => {
    endRef.current = onReachedEnd;
  });

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ url });
        destroy = () => void task.destroy();
        const loaded = await task.promise;
        const first = await loaded.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setAspect(vp.height / vp.width);
        setDoc(loaded);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const visible = containerWidth > 0;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !doc || !visible) return;
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && endRef.current?.(),
      {
        root: scroller.current,
        threshold: 0.9,
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [doc, visible]);

  const onVisible = useCallback((page: number) => setCurrent(page), []);
  const pageWidth = Math.max(200, Math.min(containerWidth - 24, 900) * zoom);
  const zoomIndex = ZOOMS.indexOf(zoom);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-[#E9EDF5]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-bg px-3 py-2">
        <p className="min-w-0 truncate text-sm font-medium" title={name}>
          {name}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {doc ? (
            <span
              className="mr-1 hidden text-xs text-ink-muted tabular-nums sm:inline"
              aria-live="polite"
            >
              {t("page", { page: current, total: doc.numPages })}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("zoomOut")}
            disabled={zoomIndex <= 0}
            onClick={() => setZoom(ZOOMS[zoomIndex - 1]!)}
          >
            <Minus />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={t("fit")} onClick={() => setZoom(1)}>
            <Maximize2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("zoomIn")}
            disabled={zoomIndex >= ZOOMS.length - 1}
            onClick={() => setZoom(ZOOMS[zoomIndex + 1]!)}
          >
            <Plus />
          </Button>
        </div>
      </div>
      <div
        ref={(el) => {
          scroller.current = el;
          setScrollRoot(el);
        }}
        role="document"
        aria-label={t("label", { name })}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-auto overscroll-contain p-3 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
      >
        {error ? (
          <p role="alert" className="py-16 text-center text-sm text-danger">
            {t("error")}
          </p>
        ) : !doc || containerWidth === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-ink-muted">
            <Spinner className="text-primary" />
            {t("loading")}
          </div>
        ) : (
          <div
            className="flex flex-col gap-3"
            style={{ width: Math.max(pageWidth, containerWidth - 24) }}
          >
            {Array.from({ length: doc.numPages }, (_, i) => (
              <PdfPage
                key={i}
                doc={doc}
                index={i}
                width={pageWidth}
                aspect={aspect}
                root={scrollRoot}
                onVisible={onVisible}
              />
            ))}
            <div ref={sentinel} className="py-3 text-center text-xs text-ink-muted">
              — {t("end")} —
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
