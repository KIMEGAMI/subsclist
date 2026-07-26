import { NextResponse } from "next/server";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(
    { isAdmin: isAdminEmail(user?.email) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
