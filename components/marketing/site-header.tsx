"use client";

import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./language-switcher";

const NAV = [
  { href: { pathname: "/", hash: "product" }, key: "product", match: null },
  { href: "/how-it-works", key: "howItWorks", match: "/how-it-works" },
  { href: "/pricing", key: "pricing", match: "/pricing" },
  { href: "/verify", key: "verify", match: "/verify" },
] as const;

export function SiteHeader() {
  const t = useTranslations("marketing.nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu on navigation (state derived during render, no effect needed).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-bg/80 backdrop-blur-md transition-colors supports-[backdrop-filter]:bg-bg/70",
        scrolled ? "border-border" : "border-transparent",
      )}
    >
      <a
        href="#main"
        className="sr-only rounded-full bg-primary px-4 py-2 text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        {t("skipToContent")}
      </a>
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Link href="/" className="rounded-lg" aria-label="DocuFirma">
          <Logo />
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={pathname === item.match ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink",
                pathname === item.match && "text-ink",
              )}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <LanguageSwitcher compact />
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">{t("login")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">{t("cta")}</Link>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? t("closeMenu") : t("openMenu")}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.nav
            id="mobile-nav"
            aria-label="Principal"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-border bg-bg lg:hidden"
          >
            <div className="container-page flex flex-col gap-1 py-4">
              {NAV.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="rounded-xl px-3 py-3 text-base font-medium text-ink hover:bg-bg-soft"
                  onClick={() => setOpen(false)}
                >
                  {t(item.key)}
                </Link>
              ))}
              <div className="mt-3 grid gap-2 border-t border-border pt-4">
                <Button asChild size="lg">
                  <Link href="/register">{t("cta")}</Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href="/login">{t("login")}</Link>
                </Button>
                <LanguageSwitcher className="justify-self-start" />
              </div>
            </div>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
