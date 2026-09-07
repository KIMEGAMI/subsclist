import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { serializeCsvCell } from "@/lib/csv";
import { isFutureMonthlyExportPeriod, monthlyExportPeriod } from "@/lib/monthly-export-period";
import { MONTHLY_PAYMENT_EXPORT_HEADERS, monthlyPaymentExportRow, type PaymentExportRecord } from "@/lib/payment-export";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

const MIN_EXPORT_YEAR = 2000;
const periodSchema = z.object({
  year: z.coerce.number().int().min(MIN_EXPORT_YEAR),
  month: z.coerce.number().int().min(1).max(12),
});

export async function GET(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  if (!isPremiumPlan(user.plan)) {
    return Response.json({ message: "月次支払CSVはPremium限定です。" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = periodSchema.safeParse({
    year: url.searchParams.get("year"),
    month: url.searchParams.get("month"),
  });
  if (!parsed.success || isFutureMonthlyExportPeriod(parsed.data.year, parsed.data.month)) {
    return Response.json(
      { message: `${MIN_EXPORT_YEAR}年以降の未来ではない年月を指定してください。` },
      { status: 400 },
    );
  }

  const { year, month } = parsed.data;
  const period = monthlyExportPeriod(year, month);
  const histories = await prisma.paymentHistory.findMany({
    where: {
      userId: user.id,
      paidAt: { gte: period.start, lt: period.end },
    },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
  });
  const rows = [
    [...MONTHLY_PAYMENT_EXPORT_HEADERS],
    ...(histories as PaymentExportRecord[]).map(monthlyPaymentExportRow),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(serializeCsvCell).join(",")).join("\r\n")}`;
  const monthText = String(month).padStart(2, "0");

  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="monthly-payments-${year}-${monthText}.csv"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
