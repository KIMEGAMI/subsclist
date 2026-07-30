import nodemailer from "nodemailer";
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
    from: env.mailFrom,
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
    html: `
      <p>SubscListへの登録ありがとうございます。</p>
      <p>以下のリンクを開いてメール認証を完了してください。</p>
      <p><a href="${escapeHtml(verifyUrl.toString())}">メール認証を完了する</a></p>
      <p>このURLの有効期限は24時間です。</p>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = new URL("/reset-password", env.appUrl);
  resetUrl.searchParams.set("token", token);

  await sendMailWithRetry({
    from: env.mailFrom,
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
    html: `
      <p>SubscListのパスワード再設定を受け付けました。</p>
      <p>以下のリンクを開いて新しいパスワードを設定してください。</p>
      <p><a href="${escapeHtml(resetUrl.toString())}">パスワードを再設定する</a></p>
      <p>このURLの有効期限は1時間です。</p>
      <p>心当たりがない場合は、このメールを破棄してください。</p>
    `,
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
  const text = lines.join("\n");
  const html = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  await sendMailWithRetry({
    from: env.mailFrom,
    to: email,
    subject: `SubscList ${title}`,
    text,
    html,
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

async function sendMailWithRetry(mail: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
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
      console.error(`Email send failed on attempt ${attempt}.`, error);
      if (attempt < MAX_SEND_ATTEMPTS) {
        await wait(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("メールを送信できませんでした。");
}
