import { NextResponse } from "next/server";
import { getAdminApiUser } from "@/lib/api-auth";
import { hasTrustedRequestOrigin } from "@/lib/csrf";
import { env } from "@/lib/env";
import { isAuthorizedJobRequest } from "@/lib/job-secret";
import { syncOfficialServicePrices } from "@/lib/service-price";

export async function POST(request: Request) {
  const jobAuthorized = isAuthorizedJobRequest(
    env.newsJobSecret,
    request.headers.get("authorization"),
  );
  if (!jobAuthorized) {
    const access = await getAdminApiUser();
    if (!access.ok) return access.response;
    const trustedOrigin = hasTrustedRequestOrigin({
      requestUrl: request.url,
      originHeader: request.headers.get("origin"),
      refererHeader: request.headers.get("referer"),
      configuredUrls: [env.appUrl],
    });
    if (!trustedOrigin) {
      return NextResponse.json({ message: "不正な送信元です。" }, { status: 403 });
    }
  }
  try {
    const result = await syncOfficialServicePrices();
    return NextResponse.json({ ok: result.failedServices.length === 0, ...result });
  } catch {
    return NextResponse.json({ message: "公式価格の確認に失敗しました。時間を置いて再実行してください。" }, { status: 503 });
  }
}
