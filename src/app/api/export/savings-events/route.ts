import { getVerifiedApiUser } from "@/lib/api-auth";
import { serializeCsvCell } from "@/lib/csv";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

const headers = ["サービス名", "種別", "確定日", "変更前月額", "変更後月額", "月額削減", "年間削減", "メモ"];
const labels: Record<string, string> = { CANCELLED: "解約", PLAN_DOWNGRADE: "プラン変更", SWITCHED: "乗り換え", PRICE_RENEGOTIATED: "料金交渉" };

export async function GET() {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  if (!isPremiumPlan(access.user.plan)) {
    return Response.json({ message: "節約実績CSVはPremium限定です。" }, { status: 403 });
  }
  const events = await prisma.savingsEvent.findMany({ where: { userId: access.user.id }, orderBy: [{ confirmedAt: "asc" }, { id: "asc" }], select: { type: true, beforeMonthlyAmount: true, afterMonthlyAmount: true, monthlySaving: true, annualSaving: true, confirmedAt: true, note: true, subscription: { select: { name: true } } } });
  const rows = [headers, ...events.map((event) => [event.subscription.name, labels[event.type] ?? event.type, event.confirmedAt.toISOString().slice(0, 10), event.beforeMonthlyAmount, event.afterMonthlyAmount, event.monthlySaving, event.annualSaving, event.note ?? ""])] as Array<Array<string | number>>;
  const csv = `\uFEFF${rows.map((row) => row.map((cell) => serializeCsvCell(String(cell))).join(",")).join("\r\n")}`;
  return new Response(csv, { headers: { "Cache-Control": "private, no-store", "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="savings-events-${new Date().toISOString().slice(0, 10)}.csv"`, "X-Content-Type-Options": "nosniff" } });
}
