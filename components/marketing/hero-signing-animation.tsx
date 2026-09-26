"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Clock, FileText, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type HeroAnimationLabels = {
  file: string;
  send: string;
  signature: string;
  signer: string;
  signed: string;
  seal: string;
  status: { ready: string; sending: string; received: string; signing: string; signed: string };
};

// Scenes of the loop and how long each one stays on screen (ms).
const SCENES = ["ready", "sending", "received", "signing", "signed"] as const;
type Scene = (typeof SCENES)[number];
const DURATION: Record<Scene, number> = {
  ready: 1600,
  sending: 1300,
  received: 900,
  signing: 2100,
  signed: 3000,
};

// Handwritten signature drawn inside the signature box (viewBox 0 0 220 70).
const SIGNATURE =
  "M8 52c10-22 22-40 30-36 9 4-10 34 3 34 9 0 16-22 27-22 7 0 4 14 14 14 9 0 12-18 22-18 8 0 6 12 16 12 8 0 14-8 22-8 7 0 10 6 18 4 9-2 16-12 26-14 6-1 10 2 14 6";

/**
 * Decorative hero loop: a simplified document is sent, reaches the signer, a stroke signs it
 * and a qualified timestamp seals it. With reduced motion the final state is shown statically.
 */
export function HeroSigningAnimation({
  labels,
  className,
}: {
  labels: HeroAnimationLabels;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [scene, setScene] = useState<Scene>("ready");

  useEffect(() => {
    if (reduce) return;
    const id = setTimeout(
      () => setScene(SCENES[(SCENES.indexOf(scene) + 1) % SCENES.length]!),
      DURATION[scene],
    );
    return () => clearTimeout(id);
  }, [scene, reduce]);

  const current: Scene = reduce ? "signed" : scene;
  const step = SCENES.indexOf(current);
  const sent = step >= 1;
  const signing = step >= 3;
  const signed = step >= 4;

  return (
    <div
      aria-hidden
      className={cn("@container relative aspect-[560/480] w-full select-none", className)}
    >
      <div className="absolute inset-[6%] rounded-full bg-[radial-gradient(closest-side,#DCE6FF,transparent)]" />

      {/* Document */}
      <motion.div
        className="absolute top-[6%] left-0 flex h-[88%] w-[57%] flex-col rounded-2xl border border-border bg-white p-[5%] shadow-card"
        animate={{ rotate: signed ? -1.5 : 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 14 }}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-bg-tint text-primary">
            <FileText className="size-4" strokeWidth={1.75} />
          </span>
          <span className="truncate text-[10px] font-semibold text-ink @md:text-xs">
            {labels.file}
          </span>
        </div>
        <div className="mt-[8%] space-y-2">
          {[100, 92, 97, 70, 0, 95, 84].map((w, i) =>
            w ? (
              <div key={i} className="h-1.5 rounded-full bg-border" style={{ width: `${w}%` }} />
            ) : (
              <div key={i} className="h-1.5" />
            ),
          )}
        </div>

        <div className="relative mt-auto rounded-xl bg-bg-soft p-2">
          <span className="text-[10px] font-medium tracking-wide text-ink-muted uppercase">
            {labels.signature}
          </span>
          <svg viewBox="0 0 220 70" className="h-auto w-full" fill="none">
            <motion.path
              d={SIGNATURE}
              stroke="#1F4FE0"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: signing ? 1 : 0, opacity: signing ? 1 : 0 }}
              transition={
                signing && !reduce
                  ? { pathLength: { duration: 1.7, ease: "easeInOut" }, opacity: { duration: 0.1 } }
                  : { duration: 0.3 }
              }
            />
            <line x1="8" y1="64" x2="212" y2="64" stroke="#C9D5F5" strokeWidth="1.5" />
          </svg>
          <AnimatePresence>
            {signed ? (
              <motion.span
                key="stamp"
                initial={{ opacity: 0, scale: 1.6, rotate: -18 }}
                animate={{ opacity: 1, scale: 1, rotate: -8 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 16 }}
                className="absolute -top-3 right-2 inline-flex items-center gap-1 rounded-md border-2 border-success bg-white px-2 py-0.5 text-[11px] font-bold tracking-wide text-success uppercase"
              >
                <Check className="size-3.5" strokeWidth={3} /> {labels.signed}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>

        <motion.div
          className={cn(
            "mt-[6%] inline-flex items-center justify-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-semibold",
            sent ? "bg-bg-tint text-primary" : "bg-primary text-white",
          )}
          animate={{ scale: current === "ready" ? [1, 1, 0.94, 1] : 1 }}
          transition={{ duration: 1.4, times: [0, 0.7, 0.85, 1] }}
        >
          {sent ? <Check className="size-3.5" strokeWidth={2.5} /> : <Send className="size-3.5" />}
          {labels.send}
        </motion.div>
      </motion.div>

      {/* Paper plane flying to the signer */}
      <AnimatePresence>
        {current === "sending" ? (
          <motion.span
            key="plane"
            className="absolute text-primary"
            initial={{ left: "12%", top: "84%", opacity: 0, rotate: -10, scale: 0.8 }}
            animate={{
              left: ["12%", "46%", "66%"],
              top: ["84%", "48%", "24%"],
              opacity: [0, 1, 1, 0],
              rotate: [-10, -25, -35],
              scale: [0.8, 1.15, 0.9],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          >
            <Send className="size-7" strokeWidth={1.75} />
          </motion.span>
        ) : null}
      </AnimatePresence>

      {/* Signer card */}
      <motion.div
        className="absolute top-[20%] right-0 w-[40%] rounded-2xl border border-border bg-white p-2 shadow-card @md:p-3"
        animate={{ y: current === "received" ? [0, -6, 0] : 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-2 @md:gap-2.5">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white @md:size-9 @md:text-xs">
            {labels.signer
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-ink @md:text-sm">
              {labels.signer}
            </span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={current}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium whitespace-nowrap @md:px-2 @md:text-[11px]",
                  signed
                    ? "bg-success/12 text-success"
                    : sent
                      ? "bg-bg-tint text-primary"
                      : "bg-bg-soft text-ink-muted",
                )}
              >
                {signed ? <Check className="size-3" strokeWidth={3} /> : null}
                {labels.status[current]}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>
      </motion.div>

      {/* Qualified timestamp */}
      <AnimatePresence>
        {signed ? (
          <motion.div
            key="seal"
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ delay: reduce ? 0 : 0.35, type: "spring", stiffness: 260, damping: 22 }}
            className="absolute right-0 bottom-[16%] flex w-[44%] items-center gap-2 rounded-2xl bg-primary p-2 text-white shadow-lg @md:gap-2.5 @md:p-3"
          >
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-white/15 @md:size-9">
              <Clock className="size-4 @md:size-4.5" strokeWidth={1.75} />
            </span>
            <span className="text-[10px] leading-snug font-semibold @md:text-xs">
              {labels.seal}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
