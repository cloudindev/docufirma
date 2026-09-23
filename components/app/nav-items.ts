import {
  CreditCard,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Send,
  Settings,
  Users,
} from "lucide-react";

export const APP_NAV: {
  href:
    "/app" | "/app/send" | "/app/envelopes" | "/app/contacts" | "/app/billing" | "/app/settings";
  key: "dashboard" | "send" | "envelopes" | "contacts" | "billing" | "settings";
  icon: LucideIcon;
}[] = [
  { href: "/app", key: "dashboard", icon: LayoutDashboard },
  { href: "/app/send", key: "send", icon: Send },
  { href: "/app/envelopes", key: "envelopes", icon: FileText },
  { href: "/app/contacts", key: "contacts", icon: Users },
  { href: "/app/billing", key: "billing", icon: CreditCard },
  { href: "/app/settings", key: "settings", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}
