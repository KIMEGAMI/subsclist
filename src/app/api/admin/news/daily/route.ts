import { NextResponse } from "next/server";
import { getAdminApiUser } from "@/lib/api-auth";
import { OfficialNewsSyncBusyError, syncOfficialNewsFeeds } from "@/lib/official-news-sync";

export async function POST(_request: Request) {
  void _request;
  const access = await getAdminApiUser();
  if (!access.ok) return access.response;
  try {
    const result = await syncOfficialNewsFeeds();
    return NextResponse.json({ ok: result.failedServices.length === 0, ...result });
  } catch (error) {
    if (error instanceof OfficialNewsSyncBusyError) {
      return NextResponse.json({ message: "ニュースを更新中です。少し待ってからもう一度お試しください。" }, { status: 409 });
    }
    return NextResponse.json(
      { message: "公式ニュースの更新に失敗しました。ニュース情報源を確認してください。" },
      { status: 503 },
    );
  }
}
