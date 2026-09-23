import localFont from "next/font/local";

/**
 * Inter (variable) served from the app itself — no third-party font requests (GDPR, D-004).
 * The "latin" subset covers Spanish and English (incl. á, é, ñ, ü, €); anything outside it
 * falls back to the system sans-serif stack defined in globals.css.
 */
export const inter = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});
