import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import {
  DEFAULT_ADMIN_USER_EMAIL,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/app-constants";
import { getMaintenanceMode } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { assertAuthSecret, env } from "@/lib/env";
import { decodeSignedSession, encodeSignedSession } from "@/lib/signed-session";

const sessionCookie = "subsclist_session";

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createVerificationToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function setSession(userId: string, emailVerified: boolean) {
  assertAuthSecret();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  if (!user) throw new Error("Session user was not found.");
  const cookieStore = await cookies();
  cookieStore.set(
    sessionCookie,
    encodeSignedSession(
      {
        userId,
        emailVerified,
        sessionVersion: user.sessionVersion,
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
      },
      env.authSecret,
    ),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  );
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookie);
}

export async function getSession() {
  assertAuthSecret();
  const cookieStore = await cookies();
  return decodeSignedSession(
    cookieStore.get(sessionCookie)?.value,
    env.authSecret,
  );
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      sessionVersion: true,
      plan: true,
      createdAt: true,
    },
  });

  if (!user) return null;
  if (session.sessionVersion !== user.sessionVersion) return null;
  return user;
}

export function isAdminEmail(email?: string | null) {
  const adminEmail = env.adminUserEmail || DEFAULT_ADMIN_USER_EMAIL;
  return Boolean(email && email.toLowerCase() === adminEmail.toLowerCase());
}

export async function requireAdminUser() {
  const user = await requireVerifiedUser();
  if (!isAdminEmail(user.email)) redirect("/dashboard");
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireVerifiedUser() {
  const user = await requireUser();
  if (!user.emailVerified) redirect("/verify-email");
  if (!isAdminEmail(user.email) && (await getMaintenanceMode()))
    redirect("/maintenance");
  return user;
}

export function readSessionFromCookieHeader(cookieHeader: string | null) {
  assertAuthSecret();
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${sessionCookie}=`));
  if (!cookie) return null;
  return decodeSignedSession(
    decodeURIComponent(cookie.slice(sessionCookie.length + 1)),
    env.authSecret,
  );
}
