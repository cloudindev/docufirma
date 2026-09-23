import type { ReactNode } from "react";
import "./globals.css";

/**
 * The real root layout (with <html>) lives in app/[locale]/layout.tsx.
 * This pass-through exists so that app/not-found.tsx can render for non-localized URLs.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
