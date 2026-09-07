import { NextResponse, type NextRequest } from "next/server";
import { maintenanceModeCookie } from "@/lib/admin-constants";
import { hasTrustedRequestOrigin, requiresCsrfValidation } from "@/lib/csrf";

const maintenancePath = "/maintenance";
const allowedPathPrefixes = [
  "/login",
  "/admin",
  "/api/admin",
  "/api/auth",
  "/api/system/status",
  "/_next",
];

const publicFilePattern =
  /\.(?:ico|png|jpg|jpeg|gif|webp|svg|css|js|txt|xml|webmanifest)$/;

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const maintenanceMode =
    request.cookies.get(maintenanceModeCookie)?.value === "enabled";

  if (
    requiresCsrfValidation(pathname, request.method) &&
    !hasTrustedRequestOrigin({
      requestUrl: request.url,
      originHeader: request.headers.get("origin"),
      refererHeader: request.headers.get("referer"),
      configuredUrls: [process.env.APP_URL, process.env.NEXTAUTH_URL],
    })
  ) {
    return NextResponse.json(
      {
        message:
          "不正な送信元です。ページを再読み込みして、もう一度お試しください。",
      },
      { status: 403 },
    );
  }

  if (!maintenanceMode) return NextResponse.next();
  if (pathname === maintenancePath) return NextResponse.next();
  if (publicFilePattern.test(pathname)) return NextResponse.next();
  if (
    allowedPathPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = maintenancePath;
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
