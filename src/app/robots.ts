import type { MetadataRoute } from "next";
import { privateRoutes, siteConfig } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/faq", "/contact", "/terms", "/privacy", "/tokushoho"],
        disallow: [...privateRoutes],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
