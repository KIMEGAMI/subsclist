import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONTACT_EMAIL } from "@/lib/app-constants";

const mailMocks = vi.hoisted(() => ({
  fetch: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(),
  createTransport: vi.fn(() => ({
    verify: vi.fn(async () => true),
    sendMail: vi.fn(async () => undefined),
  })),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: mailMocks.createTransport },
}));

type ResendPayload = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  reply_to?: string[];
};

let mail: typeof import("@/lib/mail");

function lastPayload(): ResendPayload {
  const body = mailMocks.fetch.mock.calls.at(-1)?.[1]?.body;
  if (typeof body !== "string") throw new Error("Resendの本文がありません。");
  return JSON.parse(body) as ResendPayload;
}

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "mysql://test:test@127.0.0.1:3306/subsclist_test");
  vi.stubEnv("RESEND_API_KEY", "mock-resend-token");
  vi.stubEnv("RESEND_FROM", "SubscList Test <test@example.invalid>");
  vi.stubEnv("CONTACT_EMAIL", "info@kimegami.jp");
  vi.stubEnv("APP_URL", "https://subsclist.example.invalid");
  vi.stubGlobal("fetch", mailMocks.fetch);
  vi.resetModules();
  mail = await import("@/lib/mail");
});

afterEach(() => {
  mailMocks.fetch.mockReset();
  mailMocks.createTransport.mockClear();
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("メール送信の外部通信モック", () => {
  it("認証リンクをURLエンコードし、Resendだけへ渡す", async () => {
    mailMocks.fetch.mockResolvedValue(new Response(null, { status: 200 }));

    await mail.sendVerificationEmail("member@example.invalid", "token&value");

    expect(mailMocks.fetch).toHaveBeenCalledTimes(1);
    expect(mailMocks.fetch.mock.calls[0]?.[0]).toBe("https://api.resend.com/emails");
    expect(mailMocks.fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer mock-resend-token",
    });
    const payload = lastPayload();
    expect(payload.to).toEqual(["member@example.invalid"]);
    expect(payload.text).toContain("token%26value");
    expect(payload.html).toContain("token%26value");
    expect(mailMocks.createTransport).not.toHaveBeenCalled();
  });

  it("通知の冪等性キーをResendへそのまま渡す", async () => {
    mailMocks.fetch.mockResolvedValue(new Response(null, { status: 200 }));

    await mail.sendSubscriptionReminderEmail({
      email: "member@example.invalid",
      title: "更新日のお知らせ",
      lines: ["更新日を確認してください。"],
      idempotencyKey: "notification-stable-id",
    });

    expect(new Headers(mailMocks.fetch.mock.calls[0]?.[1]?.headers).get("Idempotency-Key"))
      .toBe("notification-stable-id");
    expect(mailMocks.createTransport).not.toHaveBeenCalled();
  });

  it("問い合わせ先を固定し、名前と本文をHTMLエスケープする", async () => {
    mailMocks.fetch.mockResolvedValue(new Response(null, { status: 200 }));

    await mail.sendContactEmail({
      name: "<script>alert(1)</script>",
      email: "reply@example.invalid",
      message: "<img src=x onerror=alert(1)>",
    });

    const payload = lastPayload();
    expect(DEFAULT_CONTACT_EMAIL).toBe("info@kimegami.jp");
    expect(payload.to).toEqual([DEFAULT_CONTACT_EMAIL]);
    expect(payload.reply_to).toEqual(["reply@example.invalid"]);
    expect(payload.html).toContain("&lt;script&gt;");
    expect(payload.html).toContain("&lt;img");
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).not.toContain("<img src=x");
    expect(mailMocks.createTransport).not.toHaveBeenCalled();
  });

  it("Resendの拒否を送信失敗として扱い、SMTPへフォールバックしない", async () => {
    mailMocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      mail.sendAdminBulkEmail({
        to: "member@example.invalid",
        subject: "お知らせ",
        body: "<script>unsafe</script>",
      }),
    ).rejects.toThrow("Resend API error (503).");

    expect(mailMocks.fetch).toHaveBeenCalledTimes(3);
    const idempotencyKeys = mailMocks.fetch.mock.calls.map(
      ([, init]) => new Headers(init?.headers).get("Idempotency-Key"),
    );
    expect(idempotencyKeys[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(new Set(idempotencyKeys).size).toBe(1);
    expect(mailMocks.createTransport).not.toHaveBeenCalled();
    expect(lastPayload().html).toContain("&lt;script&gt;");
  });

  it("再試行しても回復しないResendの4xx応答は一度で終了する", async () => {
    mailMocks.fetch.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(
      mail.sendAdminBulkEmail({
        to: "member@example.invalid",
        subject: "お知らせ",
        body: "内容",
      }),
    ).rejects.toThrow("Resend API error (401).");

    expect(mailMocks.fetch).toHaveBeenCalledTimes(1);
    expect(mailMocks.createTransport).not.toHaveBeenCalled();
  });

  it("送信元が未設定ならResendへの通信を開始しない", async () => {
    vi.stubEnv("RESEND_FROM", "");
    vi.stubEnv("MAIL_FROM_ADDRESS", "");
    vi.stubEnv("MAIL_FROM", "");
    vi.resetModules();
    mail = await import("@/lib/mail");

    await expect(
      mail.sendAdminBulkEmail({
        to: "member@example.invalid",
        subject: "お知らせ",
        body: "内容",
      }),
    ).rejects.toThrow("MAIL_FROMが設定されていません。");

    expect(mailMocks.fetch).not.toHaveBeenCalled();
    expect(mailMocks.createTransport).not.toHaveBeenCalled();

    vi.stubEnv("RESEND_FROM", "SubscList Test <test@example.invalid>");
    vi.stubEnv("MAIL_FROM_ADDRESS", "");
    vi.stubEnv("MAIL_FROM", "");
    vi.resetModules();
    mail = await import("@/lib/mail");
  });
});
