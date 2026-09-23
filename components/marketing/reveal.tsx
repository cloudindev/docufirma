"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/** Fade-in-up on first view. Respects prefers-reduced-motion. */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Render as a list item when used directly inside <ul>/<ol> (valid list semantics). */
  as?: "div" | "li";
}) {
  const reduce = useReducedMotion();
  if (reduce)
    return as === "li" ? (
      <li className={className}>{children}</li>
    ) : (
      <div className={className}>{children}</div>
    );
  const Motion = as === "li" ? motion.li : motion.div;
  return (
    <Motion
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98], delay }}
    >
      {children}
    </Motion>
  );
}
