"use client";

import {
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Menu,
  Search,
  Settings,
  CreditCard,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { signOut } from "@/app/[locale]/(auth)/actions";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LanguageSwitcher } from "@/components/marketing/language-switcher";
import { Link, usePathname, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { APP_NAV, isActive } from "./nav-items";

export type ShellUser = { name: string; email: string; initials: string; company: string | null };
export type ShellCredits = { monthly: number; pack: number; total: number; monthlyGranted: number };

const SIDEBAR_COOKIE = "df_sidebar_collapsed";

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const t = useTranslations("app.nav");
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {APP_NAV.map(({ href, key, icon: Icon }) => {
        const active = isActive(pathname, href);
        const link = (
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
              active ? "bg-bg-tint text-primary" : "text-ink-muted hover:bg-bg-soft hover:text-ink",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className={cn(collapsed && "sr-only")}>{t(key)}</span>
          </Link>
        );
        return (
          <li key={key}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{t(key)}</TooltipContent>
              </Tooltip>
            ) : (
              link
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CreditsBadge({ credits }: { credits: ShellCredits }) {
  const t = useTranslations("app.topbar");
  const label =
    credits.monthlyGranted > 0
      ? t("credits", { monthly: credits.monthly, granted: credits.monthlyGranted })
      : t("creditsNoPlan", { total: credits.total });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/app/billing"
          className="rounded-full"
          aria-label={t("creditsTooltip", credits)}
        >
          <Badge
            variant={credits.total <= 2 ? "warning" : "default"}
            className="h-8 gap-1 px-3 text-xs sm:text-sm"
          >
            <span className="font-semibold">{label}</span>
            {credits.monthlyGranted > 0 && credits.pack > 0 ? (
              <span className="hidden text-ink-muted sm:inline">
                · {t("creditsPack", { pack: credits.pack })}
              </span>
            ) : null}
          </Badge>
        </Link>
      </TooltipTrigger>
      <TooltipContent>{t("creditsTooltip", credits)}</TooltipContent>
    </Tooltip>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const t = useTranslations("app.topbar");
  const locale = useLocale();
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="cursor-pointer rounded-full outline-offset-2"
          aria-label={t("account")}
          disabled={pending}
        >
          <Avatar initials={user.initials} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
          <span className="block truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings">
            <Settings /> {t("profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app/billing">
            <CreditCard /> {t("billing")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => start(() => signOut(locale))}>
          <LogOut /> {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SearchBox({ className }: { className?: string }) {
  const t = useTranslations("app.topbar");
  const router = useRouter();
  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
        router.push({ pathname: "/app/envelopes", query: q ? { q } : {} });
      }}
    >
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-muted"
        aria-hidden
      />
      <Input
        name="q"
        type="search"
        placeholder={t("search")}
        aria-label={t("searchLabel")}
        className="h-10 rounded-full pl-10"
      />
    </form>
  );
}

export function AppShell({
  user,
  credits,
  initialCollapsed,
  children,
}: {
  user: ShellUser;
  credits: ShellCredits;
  initialCollapsed: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("app.nav");
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <div className="flex min-h-dvh bg-bg-soft">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-bg transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div className={cn("flex h-16 items-center px-5", collapsed && "justify-center px-0")}>
          <Link href="/app" aria-label="DocuFirma" className="rounded-lg">
            {collapsed ? <LogoMark /> : <Logo />}
          </Link>
        </div>
        <nav
          aria-label={t("main")}
          className={cn("flex-1 overflow-y-auto px-3 py-4", collapsed && "px-3")}
        >
          <NavLinks collapsed={collapsed} />
        </nav>
        <div className="border-t border-border p-3">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full justify-start gap-3 rounded-xl text-ink-muted",
              collapsed && "justify-center",
            )}
            onClick={toggle}
            aria-label={collapsed ? t("expand") : t("collapse")}
          >
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
            <span className={cn(collapsed && "sr-only")}>
              {collapsed ? t("expand") : t("collapse")}
            </span>
          </Button>
        </div>
      </aside>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          hideClose
          className="top-0 left-0 h-dvh max-h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none rounded-r-xl p-0 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
        >
          <DialogTitle className="sr-only">{t("main")}</DialogTitle>
          <div className="flex h-16 items-center px-5">
            <Logo />
          </div>
          <nav aria-label={t("main")} className="px-3 py-2">
            <NavLinks collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </nav>
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label={t("openMenu")}
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            <SearchBox className="hidden w-full max-w-sm md:block" />
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <CreditsBadge credits={credits} />
              <LanguageSwitcher compact className="hidden sm:inline-flex" />
              <UserMenu user={user} />
            </div>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
