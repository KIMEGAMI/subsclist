import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

const publicPaths = ["/", "/pricing", "/faq", "/contact", "/terms", "/privacy", "/tokushoho"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return publicPaths.map((path) => ({
    url: new URL(path, siteConfig.url).toString(),
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
