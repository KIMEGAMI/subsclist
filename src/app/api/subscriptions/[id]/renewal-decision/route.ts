import { NextResponse } from "next/server";
import { z } from "zod";
import { PUT as saveRenewalDecision } from "@/app/api/saving-challenges/route";
import { readJsonBody } from "@/lib/request-body";

const idSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const bodySchema = z.object({ status: z.enum(["CONTINUE", "CANCEL_PLANNED", "HOLD"]), reason: z.string().trim().max(2_000).optional() }).strict();

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ message: "契約IDが正しくありません。" }, { status: 400 });
  const parsed = bodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "更新判断の入力内容を確認してください。" }, { status: 400 });
  const delegatedRequest = new Request(request.url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriptionId: id, ...parsed.data }) });
  const response = await saveRenewalDecision(delegatedRequest);
  if (!response.headers.has("Cache-Control")) response.headers.set("Cache-Control", "private, no-store");
  return response;
}
