import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { clearSession } from "@/lib/auth";
import {
  clearLoginDeviceCookie,
  revokeAllLoginSessions,
} from "@/lib/login-security";

export async function POST() {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;

  await revokeAllLoginSessions(access.user.id);
  await Promise.all([clearSession(), clearLoginDeviceCookie()]);
  return NextResponse.json({ ok: true });
}
