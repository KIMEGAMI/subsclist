import { expect, test } from "@playwright/test";

test("公開ページとPWA資産を取得できる", async ({ page, request }) => {
  const publicPages = [
    ["/", "仕事のサブスクを、判断できる台帳へ。"],
    ["/pricing", "継続課金を、毎月判断できる状態に。"],
    ["/terms", "利用規約"],
    ["/privacy", "プライバシーポリシー"],
    ["/legal-notice", "特定商取引法に基づく表記"],
    ["/faq", "よくある質問"],
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

test("未ログインではPrivate pageをログインへ戻す", async ({ page }) => {
  for (const path of ["/dashboard", "/subscriptions", "/payments", "/settings", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("新規登録は確認パスワードの不一致を送信前に表示する", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("textbox", { name: "名前", exact: true }).fill("E2E登録確認");
  await page.getByRole("textbox", { name: "メールアドレス" }).fill("register-check@invalid.example");
  await page.getByLabel("パスワード", { exact: true }).fill("E2e-register-password-123!");
  await page.getByLabel("パスワード（確認）", { exact: true }).fill("E2e-register-password-456!");
  await page.getByRole("button", { name: "登録して認証メールを送信" }).click();
  await expect(page.getByText("パスワードが一致しません。", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
});
