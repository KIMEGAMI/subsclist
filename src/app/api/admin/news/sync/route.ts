import { NextResponse } from "next/server";
import { getAdminApiUser } from "@/lib/api-auth";
import { OfficialNewsSyncBusyError, syncOfficialNewsFeeds } from "@/lib/official-news-sync";

export async function POST(request: Request) {
  void request;
  const access = await getAdminApiUser();
  if (!access.ok) return access.response;

  try {
    const result = await syncOfficialNewsFeeds();
    return NextResponse.json({
      ok: result.failedServices.length === 0,
      ...result,
    });
  } catch (error) {
    if (error instanceof OfficialNewsSyncBusyError) {
      return NextResponse.json({ message: "ニュースを更新中です。少し待ってからもう一度お試しください。" }, { status: 409 });
    }
    throw error;
  }
}
