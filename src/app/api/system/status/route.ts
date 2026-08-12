import { NextResponse } from "next/server";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";
import { getMaintenanceMode } from "@/lib/admin";

export async function GET() {
  const [maintenance, user] = await Promise.all([getMaintenanceMode(), getCurrentUser()]);

  return NextResponse.json({
    maintenance,
    isAdmin: Boolean(user?.emailVerified) && isAdminEmail(user?.email),
  });
}
