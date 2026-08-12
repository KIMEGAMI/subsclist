import { NextRequest, NextResponse } from "next/server";
import { hashToken, setSession } from "@/lib/auth";
import { isProtectedAccountEmail } from "@/lib/env";
import { prisma } from "@/lib/prisma";

function redirectToSettings(request: NextRequest, status: "success" | "invalid" | "conflict" | "error") {
  return NextResponse.redirect(new URL(`/settings?email-change=${status}`, request.url));
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return redirectToSettings(request, "invalid");

  try {
    const record = await prisma.emailChangeToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) return redirectToSettings(request, "invalid");
    if (isProtectedAccountEmail(record.newEmail)) return redirectToSettings(request, "invalid");

    const existingUser = await prisma.user.findUnique({ where: { email: record.newEmail }, select: { id: true } });
    if (existingUser && existingUser.id !== record.userId) return redirectToSettings(request, "conflict");

    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { email: record.newEmail, emailVerified: now, sessionVersion: { increment: 1 } },
      }),
      prisma.emailChangeToken.update({ where: { id: record.id }, data: { usedAt: now } }),
      prisma.emailChangeToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } }),
    ]);
    await setSession(record.userId, true);
    return redirectToSettings(request, "success");
  } catch {
    console.error("Failed to verify email address change.");
    return redirectToSettings(request, "error");
  }
}
