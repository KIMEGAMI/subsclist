import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
] as const;

const productionContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
].join("; ");

const privateRouteSources = [
  "/admin/:path*", "/analytics/:path*", "/calendar/:path*", "/categories/:path*", "/dashboard/:path*", "/export/:path*",
  "/monthly-report/:path*", "/notifications/:path*", "/payment-methods/:path*", "/payment-totals/:path*", "/payments/:path*",
  "/review/:path*", "/settings/:path*", "/simulation/:path*", "/subscriptions/:path*", "/api/:path*", "/login", "/register",
  "/forgot-password", "/reset-password", "/verify-email", "/maintenance",
];

const nextConfig: NextConfig = {
  devIndicators: false,
  async headers() {
    const headers: Array<{ key: string; value: string }> = [...securityHeaders];
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Content-Security-Policy", value: productionContentSecurityPolicy });
    }
    return [
      { source: "/:path*", headers },
      ...privateRouteSources.map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      })),
    ];
  },
};

export default nextConfig;
