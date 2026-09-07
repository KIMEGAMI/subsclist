import { NextResponse } from "next/server";
import { getMaintenanceMode } from "@/lib/admin";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";

export async function getVerifiedApiUser() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: "ログインしてください。" },
        { status: 401 },
      ),
    };
  }
  if (!user.emailVerified) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: "メール認証が必要です。" },
        { status: 403 },
      ),
    };
  }
  if (!isAdminEmail(user.email) && (await getMaintenanceMode())) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: "現在メンテナンス中です。終了後にもう一度お試しください。" },
        { status: 503, headers: { "Retry-After": "300" } },
      ),
    };
  }

  return { ok: true as const, user };
}

export async function getAdminApiUser() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: "ログインしてください。" },
        { status: 401 },
      ),
    };
  }
  if (!user.emailVerified || !isAdminEmail(user.email)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: "管理者のみ実行できます。" },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const, user };
}
