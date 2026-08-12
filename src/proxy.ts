import { NextResponse, type NextRequest } from "next/server";
import { maintenanceModeCookie } from "@/lib/admin-constants";

const maintenancePath = "/maintenance";
const csrfExemptApiPaths = ["/api/stripe/webhook", "/api/notifications/send"];
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const allowedPathPrefixes = [
  "/login",
  "/admin",
  "/api/admin",
  "/api/auth",
  "/api/system/status",
  "/_next",
];

const publicFilePattern = /\.(?:ico|png|jpg|jpeg|gif|webp|svg|css|js|txt|xml|webmanifest)$/;

function isCsrfProtectedApiRequest(request: NextRequest) {
  return request.nextUrl.pathname.startsWith("/api/")
    && unsafeMethods.has(request.method)
    && !csrfExemptApiPaths.includes(request.nextUrl.pathname);
}

function hasSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const configuredOrigins = [process.env.APP_URL, process.env.NEXTAUTH_URL]
    .flatMap((value) => {
      try {
        return value ? [new URL(value).origin] : [];
      } catch {
        return [];
      }
    });
  return Boolean(origin && [request.nextUrl.origin, ...configuredOrigins].includes(origin));
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const maintenanceMode = request.cookies.get(maintenanceModeCookie)?.value === "enabled";

  if (isCsrfProtectedApiRequest(request) && !hasSameOrigin(request)) {
    return NextResponse.json({ message: "不正な送信元です。ページを再読み込みして、もう一度お試しください。" }, { status: 403 });
  }

  if (!maintenanceMode) return NextResponse.next();
  if (pathname === maintenancePath) return NextResponse.next();
  if (publicFilePattern.test(pathname)) return NextResponse.next();
  if (allowedPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = maintenancePath;
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!.*\\.).*)"],
};
