import type { MetadataRoute } from "next";
import { publicSiteUrl } from "@/lib/site-url";

const privatePaths = [
  "/admin/", "/analytics/", "/calendar/", "/categories/", "/dashboard/", "/export/", "/monthly-report/",
  "/notifications/", "/payment-methods/", "/payment-totals/", "/payments/", "/review/", "/settings/",
  "/simulation/", "/subscriptions/", "/api/", "/login", "/register", "/forgot-password", "/reset-password",
  "/verify-email", "/maintenance",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: privatePaths },
    sitemap: new URL("/sitemap.xml", publicSiteUrl).toString(),
  };
}
