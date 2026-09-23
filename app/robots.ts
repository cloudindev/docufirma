import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env-public";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth/", "/es/app", "/en/app", "/es/sign/", "/en/sign/"],
      },
    ],
    sitemap: appUrl("/sitemap.xml"),
    host: appUrl(),
  };
}
