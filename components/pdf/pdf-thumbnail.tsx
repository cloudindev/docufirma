"use client";

import { FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadPdfjs } from "@/lib/pdf/pdfjs-client";
import { cn } from "@/lib/utils";

/** Renders page 1 of a PDF (from a URL) into a small canvas. */
export function PdfThumbnail({
  getUrl,
  cacheKey,
  className,
  label,
}: {
  getUrl: () => Promise<string | null>;
  cacheKey: string;
  className?: string;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await getUrl();
        if (!url || cancelled) throw new Error("no url");
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ url });
        const doc = await task.promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const scale = 160 / base.width;
        const viewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        if (!cancelled) setState("ready");
        void task.destroy();
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-render only when the document changes
  }, [cacheKey]);

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-lg border border-border bg-bg-soft",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        className={cn("h-full w-full object-contain", state !== "ready" && "hidden")}
      />
      {state !== "ready" ? (
        <FileText
          className={cn("size-6 text-ink-muted", state === "loading" && "animate-pulse")}
          strokeWidth={1.5}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
