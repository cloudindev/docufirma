"use client";

import type * as PdfJsModule from "pdfjs-dist";

type PdfJs = typeof PdfJsModule;

let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * Lazily loads pdf.js with its module worker (bundled by Next, no CDN).
 * The *legacy* build is used on purpose: the modern v6 build relies on very recent JS APIs
 * (e.g. Map.prototype.getOrInsertComputed) missing in many mobile browsers, and the signer
 * view must work on older iOS/Android devices.
 */
export function loadPdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((mod) => {
    const pdfjs = mod as unknown as PdfJs;
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return pdfjs;
  });
  return pdfjsPromise;
}
