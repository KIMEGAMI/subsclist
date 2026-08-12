import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_CONTACT_MESSAGE_LENGTH, MAX_EMAIL_LENGTH, MAX_USER_NAME_LENGTH } from "@/lib/app-constants";
import { getContactClientKey, hasContactNgPhrase, isContactRateLimited, recordContactAttempt } from "@/lib/contact-guard";
import { assertMailEnv, env } from "@/lib/env";
import { sendContactEmail } from "@/lib/mail";

const schema = z.object({
  name: z.string().trim().min(1).max(MAX_USER_NAME_LENGTH),
  email: z.string().trim().email().max(MAX_EMAIL_LENGTH),
  message: z.string().trim().min(1).max(MAX_CONTACT_MESSAGE_LENGTH),
  website: z.string().trim().max(200).optional(),
});

function clientIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function hasValidOrigin(request: Request) {
  return request.headers.get("origin") === env.appUrl;
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ message: "不正な送信元です。ページを再読み込みして、もう一度お試しください。" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "お名前、メールアドレス、お問い合わせ内容を確認してください。" }, { status: 400 });
  }
  if (parsed.data.website) {
    return NextResponse.json({ ok: true, message: "お問い合わせを受け付けました。" });
  }
  if (hasContactNgPhrase(parsed.data.message)) {
    return NextResponse.json({ message: "お問い合わせ内容を確認してください。" }, { status: 400 });
  }

  const clientKey = getContactClientKey(clientIdentifier(request), env.authSecret);
  if (isContactRateLimited(clientKey)) {
    return NextResponse.json({ message: "短時間に送信できる回数を超えました。時間をおいて、もう一度お試しください。" }, { status: 429 });
  }

  try {
    assertMailEnv();
    await sendContactEmail({ name: parsed.data.name, email: parsed.data.email, message: parsed.data.message });
    recordContactAttempt(clientKey);
    return NextResponse.json({ ok: true, message: "お問い合わせを受け付けました。" });
  } catch {
    return NextResponse.json({ message: "お問い合わせを送信できませんでした。時間をおいて、もう一度お試しください。" }, { status: 500 });
  }
}
