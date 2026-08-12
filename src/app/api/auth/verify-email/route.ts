import { NextRequest, NextResponse } from "next/server";
import { hashToken, setSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function verifyEmailUrl(request: NextRequest, status: "success" | "invalid" | "error") {
  return new URL(`/verify-email?status=${status}`, request.url);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(verifyEmailUrl(request, "invalid"));
  }

  try {
    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return NextResponse.redirect(verifyEmailUrl(request, "invalid"));
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: new Date() },
      }),
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await setSession(record.userId, true);
    return NextResponse.redirect(verifyEmailUrl(request, "success"));
  } catch {
    console.error("Failed to verify email token.");
    return NextResponse.redirect(verifyEmailUrl(request, "error"));
  }
}
