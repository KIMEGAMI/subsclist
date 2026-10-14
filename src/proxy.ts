import { NextResponse, type NextRequest } from "next/server";
import { getMaintenanceMode } from "@/lib/admin";
import { hasTrustedRequestOrigin, requiresCsrfValidation } from "@/lib/csrf";
import { shouldBlockDemoMutation } from "@/lib/demo-readonly";
import { isAdminEmail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decodeSignedSession, SESSION_COOKIE_NAME } from "@/lib/signed-session";

const maintenancePath = "/maintenance";
const allowedPathPrefixes = [
  "/login",
  "/admin",
  "/api/auth",
  "/api/admin",
  "/api/system/status",
  "/api/stripe/webhook",
  "/api/notifications/send",
  "/_next",
];

const publicFilePattern =
  /\.(?:ico|png|jpg|jpeg|gif|webp|svg|css|js|txt|xml|webmanifest)$/;

async function isVerifiedAdmin(request: NextRequest) {
  const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  const session = decodeSignedSession(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
    authSecret,
  );
  if (!session?.emailVerified) return false;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, emailVerified: true, sessionVersion: true },
  });

  return Boolean(
    user?.emailVerified &&
      user.sessionVersion === session.sessionVersion &&
      isAdminEmail(user.email),
  );
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

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

  const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  const session = decodeSignedSession(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
    authSecret,
  );
  if (session?.demoReadOnly && shouldBlockDemoMutation(request.method, pathname)) {
    return NextResponse.json(
      { message: "デモアカウントは閲覧専用です。変更する場合はご自身のアカウントでご利用ください。" },
      { status: 403 },
    );
  }

  const maintenanceExempt = pathname === maintenancePath ||
    (!pathname.startsWith("/api/") && publicFilePattern.test(pathname)) ||
    allowedPathPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

  if (pathname.startsWith("/api/")) {
    if (maintenanceExempt) return NextResponse.next();
    if (!(await getMaintenanceMode())) return NextResponse.next();
    return NextResponse.json(
      { message: "ただいまメンテナンス中です。時間をおいて、もう一度お試しください。" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (maintenanceExempt || !(await getMaintenanceMode())) return NextResponse.next();
  if (await isVerifiedAdmin(request)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = maintenancePath;
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
