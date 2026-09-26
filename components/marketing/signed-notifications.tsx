"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

export type SignedNotification = { title: string; meta: string };

/**
 * Decorative stack of "document signed" toasts over the home photo. A new one slides in every
 * few seconds; with reduced motion the first two are shown statically.
 */
export function SignedNotifications({ items }: { items: SignedNotification[] }) {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduce || items.length < 2) return;
    const id = setInterval(() => setTick((n) => n + 1), 2800);
    return () => clearInterval(id);
  }, [reduce, items.length]);

  // Newest at the bottom edge; the two previous ones stack above it, fading out.
  const visible = [0, 1, 2]
    .map((offset) => tick - offset)
    .filter((n) => n >= 0 || reduce)
    .slice(0, reduce ? 2 : 3)
    .map((n) => ({ key: n, item: items[((n % items.length) + items.length) % items.length]! }));

  return (
    <div
      aria-hidden
      className="pointer-events-none flex w-80 max-w-[88vw] flex-col-reverse gap-2.5"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {visible.map(({ key, item }, depth) => (
          <motion.div
            key={key}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1 - depth * 0.28, y: 0, scale: 1 - depth * 0.04 }}
            exit={{ opacity: 0, y: -16, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="flex items-center gap-3 rounded-xl bg-white/95 p-3 shadow-lg ring-1 ring-black/5 backdrop-blur"
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-success/12 text-success">
              <CheckCircle2 className="size-5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
              <span className="block truncate text-xs text-ink-muted">{item.meta}</span>
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
