import type { Locale } from "@/lib/i18n/routing";
import type { Messages } from "@/lib/i18n/messages";
import type { formats } from "@/lib/i18n/formats";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
    Formats: typeof formats;
  }
}
