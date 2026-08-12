import { NextResponse } from "next/server";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(
    { isAdmin: Boolean(user?.emailVerified) && isAdminEmail(user?.email) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
