import { requireUser } from "@/lib/auth/session";
import { resolveLocale } from "@/lib/i18n/server";

/** Every /app route requires a verified session (the proxy also enforces it). */
export default async function AppRootLayout({ children, params }: LayoutProps<"/[locale]/app">) {
  const locale = await resolveLocale(params);
  await requireUser(locale);
  return children;
}
