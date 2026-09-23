import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env-public";
import { getPathname } from "@/lib/i18n/navigation";
import { locales } from "@/lib/i18n/routing";
import { LEGAL_SLUGS, LEGAL_UPDATED_AT } from "@/lib/legal";

type Href = Parameters<typeof getPathname>[0]["href"];

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: {
    href: Href;
    priority: number;
    changeFrequency: "weekly" | "monthly" | "yearly";
  }[] = [
    { href: "/", priority: 1, changeFrequency: "weekly" },
    { href: "/pricing", priority: 0.9, changeFrequency: "monthly" },
    { href: "/how-it-works", priority: 0.8, changeFrequency: "monthly" },
    { href: "/verify", priority: 0.6, changeFrequency: "yearly" },
    { href: "/register", priority: 0.5, changeFrequency: "yearly" },
    ...LEGAL_SLUGS.map((slug) => ({
      href: { pathname: "/legal/[slug]" as const, params: { slug } },
      priority: 0.3,
      changeFrequency: "yearly" as const,
    })),
  ];
  const lastModified = new Date(LEGAL_UPDATED_AT);
  return pages.flatMap((page) =>
    locales.map((locale) => ({
      url: appUrl(getPathname({ href: page.href, locale })),
      lastModified,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, appUrl(getPathname({ href: page.href, locale: l }))]),
        ),
      },
    })),
  );
}
