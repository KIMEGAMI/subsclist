import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";
import { assertAuthSecret, env } from "@/lib/env";

const sessionCookie = "subsclist_session";

type SessionPayload = {
  userId: string;
  emailVerified: boolean;
  exp: number;
};

function sign(value: string) {
  assertAuthSecret();
  return crypto.createHmac("sha256", env.authSecret).update(value).digest("base64url");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createVerificationToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function encodeSession(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeSession(value?: string): SessionPayload | null {
  if (!value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature || sign(body) !== signature) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setSession(userId: string, emailVerified: boolean) {
  const cookieStore = await cookies();
  cookieStore.set(
    sessionCookie,
    encodeSession({
      userId,
      emailVerified,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
    }),
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
  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(sessionCookie)?.value);
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
      plan: true,
      createdAt: true,
    },
  });

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
  return user;
}

export function readSessionFromCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${sessionCookie}=`));
  if (!cookie) return null;
  return decodeSession(decodeURIComponent(cookie.slice(sessionCookie.length + 1)));
}
