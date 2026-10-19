import { expect, test } from "@playwright/test";
import { deleteE2eRegistrationUser } from "./database";
import { AUTH_FLOW_TIMEOUT_MS, REGISTRATION_E2E_CLIENT_IP } from "./constants";

test("公開ページとPWA資産を取得できる", async ({ page, request }) => {
  const publicPages = [
    ["/", "仕事のサブスクを、判断できる台帳へ。"],
    ["/terms", "利用規約"],
    ["/privacy", "プライバシーポリシー"],
    ["/faq", "よくある質問"],
    ["/manual", "SubscList 操作マニュアル"],
    ["/contact", "お問い合わせ"],
  ] as const;
  for (const [path, heading] of publicPages) {
    const response = await page.goto(path);
    expect(response?.ok(), path).toBe(true);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()) as { name: string }).toMatchObject({ name: "サブスクリスト" });
  expect((await request.get("/sw.js")).ok()).toBe(true);
});

test("料金と旧販売表記のURLは無料公開版トップへ案内する", async ({ page }) => {
  for (const path of ["/pricing", "/legal-notice"]) {
    const response = await page.goto(path);
    expect(response?.ok(), path).toBe(true);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "仕事のサブスクを、判断できる台帳へ。", exact: true })).toBeVisible();
    await expect(page.getByText("ポートフォリオ版として、登録から全機能まで無料で利用できます。")).toBeVisible();
  }
});

test("操作マニュアルの目次が各手順へ移動でき、スマートフォン幅では横にはみ出さない", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const response = await page.goto("/manual");
  expect(response?.ok()).toBe(true);

  const links = page.getByRole("navigation", { name: "マニュアル目次" }).getByRole("link");
  const hrefs = await links.evaluateAll((items) => items.map((item) => item.getAttribute("href")));
  expect(hrefs.length).toBeGreaterThan(10);
  for (const href of hrefs) {
    expect(href).toMatch(/^#[a-z-]+$/);
    await expect(page.locator(href as string)).toHaveCount(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByText(/実際の請求、解約手続きは代行しません/)).toBeVisible();
});

test("スマートフォン幅でトップページのログイン導線が表示され横にはみ出さない", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("link", { name: "ログイン", exact: true })).toHaveAttribute("href", "/login");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("未ログインではPrivate pageをログインへ戻す", async ({ page }) => {
  for (const path of ["/dashboard", "/subscriptions", "/payments", "/settings", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("Google OAuth未設定時はログイン・登録画面にGoogleボタンを表示しない", async ({ page }) => {
  for (const path of ["/login", "/register"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Googleでログイン" })).toHaveCount(0);
  }
});

test("公開デモは契約情報を閲覧できるが、アカウントの変更は拒否される", async ({ page }) => {
  await page.goto("/");
  const loginStatus = await page.evaluate(async () => {
    const response = await fetch("/api/auth/demo-login", { method: "POST" });
    return response.status;
  });
  expect(loginStatus).toBe(200);

  await page.goto("/subscriptions");
  await expect(page.getByText("E2E Cloud", { exact: true }).last()).toBeVisible();

  const mutation = await page.evaluate(async () => {
    const response = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "変更テスト" }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(mutation.status).toBe(403);
  expect(mutation.body.message).toContain("閲覧専用");
});

test("新規登録では認証前にパスワードを要求しない", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("textbox", { name: "名前", exact: true }).fill("E2E登録確認");
  await page.getByRole("textbox", { name: "メールアドレス" }).fill("register-check@invalid.example");
  await expect(page.getByLabel("パスワード", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("パスワード（確認）", { exact: true })).toHaveCount(0);
  await expect(page.getByText("認証メールのリンクから本人確認を行い、その画面でパスワードを設定します。")).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
});

test("新規登録後はアドレスの状態を区別せず共通案内を表示する", async ({ page }, testInfo) => {
  const clientIp = testInfo.project.name === "mobile"
    ? REGISTRATION_E2E_CLIENT_IP.mobile
    : REGISTRATION_E2E_CLIENT_IP.desktop;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": clientIp });
  const email = `registration-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@invalid.example`;
  try {
    await page.goto("/register");
    await page.getByRole("textbox", { name: "名前", exact: true }).fill("E2E登録フロー");
    await page.getByRole("textbox", { name: "メールアドレス" }).fill(email);
    await page.getByLabel("利用規約に同意します").check();
    await page.getByLabel("プライバシーポリシーに同意します").check();
    await page.getByRole("button", { name: "登録して認証メールを送信" }).click();
    await expect(page).toHaveURL(/\/login\?notice=verification$/, { timeout: AUTH_FLOW_TIMEOUT_MS });
    await expect(page.getByText(/申請を受け付けました。入力したアドレスが未認証の場合/)).toBeVisible();
  } finally {
    await deleteE2eRegistrationUser(email);
  }
});
