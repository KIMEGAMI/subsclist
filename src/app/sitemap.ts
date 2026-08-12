import type { MetadataRoute } from "next";
import { publicSiteUrl } from "@/lib/site-url";

const publicPaths = ["/", "/pricing", "/faq", "/terms", "/privacy", "/legal-notice", "/security", "/contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({ url: new URL(path, publicSiteUrl).toString() }));
}
