import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { serializeCsvCell } from "@/lib/csv";
import { PAYMENT_EXPORT_HEADERS, paymentExportRow, type PaymentExportRecord } from "@/lib/payment-export";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

const MIN_EXPORT_YEAR = 2000;

function exportYearSchema(currentYear: number) {
  return z.coerce.number().int().min(MIN_EXPORT_YEAR).max(currentYear);
}

export async function GET(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  if (!isPremiumPlan(user.plan)) {
    return NextResponse.json({ message: "支払実績CSVはPremium限定です。" }, { status: 403 });
  }

  const currentYear = new Date().getFullYear();
  const parsedYear = exportYearSchema(currentYear).safeParse(new URL(request.url).searchParams.get("year"));
  if (!parsedYear.success) {
    return NextResponse.json(
      { message: `${MIN_EXPORT_YEAR}年から${currentYear}年までの年を指定してください。` },
      { status: 400 },
    );
  }

  const year = parsedYear.data;
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const histories = await prisma.paymentHistory.findMany({
    where: { userId: user.id, paidAt: { gte: start, lt: end } },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
  });

  const rows = [
    [...PAYMENT_EXPORT_HEADERS],
    ...(histories as PaymentExportRecord[]).map(paymentExportRow),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(serializeCsvCell).join(",")).join("\r\n")}`;

  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payment-history-${year}.csv"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
