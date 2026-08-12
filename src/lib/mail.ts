import nodemailer from "nodemailer";
import { SYSTEM_EMAIL_ADDRESS, SYSTEM_EMAIL_FROM } from "@/lib/app-constants";
import { assertMailEnv, env } from "@/lib/env";

const MAX_SEND_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1200;

function createTransporter() {
  assertMailEnv();
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendVerificationEmail(email: string, token: string) {
  const verifyUrl = new URL("/api/auth/verify-email", env.appUrl);
  verifyUrl.searchParams.set("token", token);

  await sendMailWithRetry({
    from: SYSTEM_EMAIL_FROM,
    to: email,
    subject: "SubscList メール認証",
    text: [
      "SubscListへの登録ありがとうございます。",
      "以下のURLを開いてメール認証を完了してください。",
      "",
      verifyUrl.toString(),
      "",
      "このURLの有効期限は24時間です。",
    ].join("\n"),
    html: [
      "<p>SubscListへの登録ありがとうございます。</p>",
      "<p>以下のリンクを開いてメール認証を完了してください。</p>",
      `<p><a href="${escapeHtml(verifyUrl.toString())}">メール認証を完了する</a></p>`,
      "<p>このURLの有効期限は24時間です。</p>",
    ].join(""),
  });
}

export async function sendEmailChangeVerificationEmail(email: string, token: string) {
  const verifyUrl = new URL("/api/auth/verify-email-change", env.appUrl);
  verifyUrl.searchParams.set("token", token);

  await sendMailWithRetry({
    from: SYSTEM_EMAIL_FROM,
    to: email,
    subject: "SubscList メールアドレス変更の確認",
    text: [
      "SubscListのメールアドレス変更が申請されました。",
      "以下のURLを開くと、新しいメールアドレスへの変更が完了します。",
      "",
      verifyUrl.toString(),
      "",
      "このURLの有効期限は24時間です。心当たりがない場合は、このメールを破棄してください。",
    ].join("\n"),
    html: [
      "<p>SubscListのメールアドレス変更が申請されました。</p>",
      "<p>以下のリンクを開くと、新しいメールアドレスへの変更が完了します。</p>",
      `<p><a href="${escapeHtml(verifyUrl.toString())}">メールアドレスの変更を確認する</a></p>`,
      "<p>このURLの有効期限は24時間です。心当たりがない場合は、このメールを破棄してください。</p>",
    ].join(""),
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = new URL("/reset-password", env.appUrl);
  resetUrl.searchParams.set("token", token);

  await sendMailWithRetry({
    from: SYSTEM_EMAIL_FROM,
    to: email,
    subject: "SubscList パスワード再設定",
    text: [
      "SubscListのパスワード再設定を受け付けました。",
      "以下のURLを開いて新しいパスワードを設定してください。",
      "",
      resetUrl.toString(),
      "",
      "このURLの有効期限は1時間です。",
      "心当たりがない場合は、このメールを破棄してください。",
    ].join("\n"),
    html: [
      "<p>SubscListのパスワード再設定を受け付けました。</p>",
      "<p>以下のリンクを開いて新しいパスワードを設定してください。</p>",
      `<p><a href="${escapeHtml(resetUrl.toString())}">パスワードを再設定する</a></p>`,
      "<p>このURLの有効期限は1時間です。</p>",
      "<p>心当たりがない場合は、このメールを破棄してください。</p>",
    ].join(""),
  });
}

export async function sendSubscriptionReminderEmail({
  email,
  title,
  lines,
}: {
  email: string;
  title: string;
  lines: string[];
}) {
  await sendSystemEmail({
    to: email,
    subject: `SubscList ${title}`,
    text: lines.join("\n"),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
  });
}

export async function sendAdminBulkEmail({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}) {
  await sendSystemEmail({
    to,
    subject: `SubscList ${subject}`,
    text: body,
    html: body.split(/\r?\n/).map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`).join(""),
  });
}

export async function sendContactEmail({
  name,
  email,
  message,
}: {
  name: string;
  email: string;
  message: string;
}) {
  const text = [
    "SubscListの問い合わせフォームから送信されました。",
    "",
    `名前: ${name}`,
    `メールアドレス: ${email}`,
    "",
    message,
  ].join("\n");

  await sendMailWithRetry({
    from: SYSTEM_EMAIL_FROM,
    to: SYSTEM_EMAIL_ADDRESS,
    replyTo: email,
    subject: "SubscList 問い合わせ",
    text,
    html: [
      "<p>SubscListの問い合わせフォームから送信されました。</p>",
      `<p><strong>名前:</strong> ${escapeHtml(name)}</p>`,
      `<p><strong>メールアドレス:</strong> ${escapeHtml(email)}</p>`,
      "<hr />",
      ...message.split(/\r?\n/).map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`),
    ].join(""),
  });
}

async function sendSystemEmail(mail: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  await sendMailWithRetry({
    ...mail,
    from: SYSTEM_EMAIL_FROM,
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mailErrorKind(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "unknown";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^[A-Z0-9_]{1,64}$/.test(code) ? code : "unknown";
}

async function sendMailWithRetry(mail: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
    try {
      const transporter = createTransporter();
      await transporter.verify();
      await transporter.sendMail(mail);
      return;
    } catch (error) {
      lastError = error;
      console.error(`Email send failed on attempt ${attempt} (kind: ${mailErrorKind(error)}).`);
      if (attempt < MAX_SEND_ATTEMPTS) {
        await wait(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("メールを送信できませんでした。");
}
