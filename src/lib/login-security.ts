import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import {
  LOGIN_DEVICE_COOKIE_MAX_AGE_SECONDS,
  MAX_LOGIN_SECURITY_EVENTS,
  MAX_TRUSTED_LOGIN_DEVICES,
} from "@/lib/app-constants";
import { assertAuthSecret, env } from "@/lib/env";
import {
  isAccountLoginLocked,
  loginClientLabel,
  nextLoginFailure,
} from "@/lib/login-security-policy";
import { prisma } from "@/lib/prisma";

const loginDeviceCookie = "subsclist_login_device";
const loginDeviceTokenPattern = /^[A-Za-z0-9_-]{43}$/;

function hashLoginDeviceToken(token: string) {
  assertAuthSecret();
  return createHmac("sha256", env.authSecret)
    .update(`login-device\n${token}`)
    .digest("hex");
}

export async function recordFailedLogin(userId: string, now = new Date()) {
  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: {
        failedLoginCount: true,
        lastFailedLoginAt: true,
        lockedUntil: true,
      },
    });
    if (!user) return { newlyLocked: false, lockedUntil: null };

    const failure = nextLoginFailure(user, now);
    const newlyLocked = Boolean(
      failure.lockedUntil && !isAccountLoginLocked(user.lockedUntil, now),
    );
    await transaction.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: failure.failedLoginCount,
        lastFailedLoginAt: now,
        lockedUntil: failure.lockedUntil,
      },
    });
    if (newlyLocked) {
      await transaction.loginSecurityEvent.create({
        data: { userId, type: "ACCOUNT_LOCKED" },
      });
    }

    return { newlyLocked, lockedUntil: failure.lockedUntil };
  });
}

export async function recordSuccessfulLogin(userId: string, request: Request) {
  assertAuthSecret();
  const cookieStore = await cookies();
  const savedToken = cookieStore.get(loginDeviceCookie)?.value;
  const token =
    savedToken && loginDeviceTokenPattern.test(savedToken)
      ? savedToken
      : randomBytes(32).toString("base64url");
  const tokenHash = hashLoginDeviceToken(token);
  const clientLabel = loginClientLabel(request.headers.get("user-agent"));
  const now = new Date();

  const result = await prisma.$transaction(async (transaction) => {
    const [knownDevice, deviceCount] = await Promise.all([
      transaction.trustedLoginDevice.findUnique({
        where: { userId_tokenHash: { userId, tokenHash } },
        select: { id: true },
      }),
      transaction.trustedLoginDevice.count({ where: { userId } }),
    ]);
    const newDevice = deviceCount > 0 && !knownDevice;

    await transaction.trustedLoginDevice.upsert({
      where: { userId_tokenHash: { userId, tokenHash } },
      create: { userId, tokenHash, clientLabel, lastUsedAt: now },
      update: { clientLabel, lastUsedAt: now },
    });
    await transaction.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: 0,
        lastFailedLoginAt: null,
        lockedUntil: null,
        lastLoginAt: now,
      },
    });
    await transaction.loginSecurityEvent.create({
      data: {
        userId,
        type: newDevice ? "NEW_DEVICE" : "LOGIN_SUCCESS",
        clientLabel,
        createdAt: now,
      },
    });

    const staleDevices = await transaction.trustedLoginDevice.findMany({
      where: { userId },
      orderBy: { lastUsedAt: "desc" },
      skip: MAX_TRUSTED_LOGIN_DEVICES,
      select: { id: true },
    });
    if (staleDevices.length > 0) {
      await transaction.trustedLoginDevice.deleteMany({
        where: { id: { in: staleDevices.map((device) => device.id) } },
      });
    }

    const staleEvents = await transaction.loginSecurityEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: MAX_LOGIN_SECURITY_EVENTS,
      select: { id: true },
    });
    if (staleEvents.length > 0) {
      await transaction.loginSecurityEvent.deleteMany({
        where: { id: { in: staleEvents.map((event) => event.id) } },
      });
    }

    return { newDevice, clientLabel, occurredAt: now };
  });

  cookieStore.set(loginDeviceCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LOGIN_DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
  return result;
}

export async function revokeAllLoginSessions(userId: string) {
  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
    await transaction.trustedLoginDevice.deleteMany({ where: { userId } });
    await transaction.loginSecurityEvent.create({
      data: { userId, type: "ALL_SESSIONS_REVOKED" },
    });
  });
}

export async function clearLoginDeviceCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(loginDeviceCookie);
}
