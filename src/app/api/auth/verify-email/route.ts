import { NextRequest, NextResponse } from "next/server";
import { hashToken, setSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function verifyEmailUrl(
  request: NextRequest,
  status: "success" | "invalid" | "error",
) {
  return new URL(`/verify-email?status=${status}`, request.url);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(verifyEmailUrl(request, "invalid"));
  }

  try {
    const now = new Date();
    const userId = await prisma.$transaction(async (transaction) => {
      const record = await transaction.emailVerificationToken.findUnique({
        where: { tokenHash: hashToken(token) },
        select: { id: true, userId: true, usedAt: true, expiresAt: true },
      });
      if (!record || record.usedAt || record.expiresAt <= now) return null;

      const claimed = await transaction.emailVerificationToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return null;

      await transaction.user.update({
        where: { id: record.userId },
        data: { emailVerified: now },
      });
      return record.userId;
    });
    if (!userId) {
      return NextResponse.redirect(verifyEmailUrl(request, "invalid"));
    }

    await setSession(userId, true);
    return NextResponse.redirect(verifyEmailUrl(request, "success"));
  } catch {
    console.error("Failed to verify email token.");
    return NextResponse.redirect(verifyEmailUrl(request, "error"));
  }
}
