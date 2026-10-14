import { expect, test } from "@playwright/test";
import { AUTH_FLOW_TIMEOUT_MS } from "./constants";

async function openDemo(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "デモを開く", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: AUTH_FLOW_TIMEOUT_MS });
}

async function openMember(page: import("@playwright/test").Page) {
  const email = process.env.E2E_MEMBER_EMAIL ?? "";
  const password = process.env.E2E_USER_PASSWORD ?? "";
  expect(email).not.toBe("");
  expect(password).not.toBe("");

  await page.goto("/login");
  await page.getByRole("textbox", { name: "メールアドレス" }).fill(email);
  await page.getByRole("textbox", { name: "パスワード" }).fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("デモユーザーで主要ページを利用しログアウトできる", async ({ page }) => {
  await openDemo(page);
  const adminLink = page.getByRole("link", { name: /管理者メニュー/ });
  await expect(adminLink).toHaveCount(0);

  const pages = [
    ["/dashboard", "ダッシュボード"],
    ["/subscriptions", "サブスク一覧"],
    ["/calendar", "更新日カレンダー"],
    ["/analytics", "分析"],
    ["/payments", "支払い確認"],
    ["/export", "CSV入出力"],
    ["/settings", "設定"],
  ] as const;
  for (const [path, heading] of pages) {
    const response = await page.goto(path);
    expect(response?.ok(), path).toBe(true);
    expect(response?.headers()["cache-control"], `${path} cache-control`).toContain("no-store");
    expect(response?.headers()["x-robots-tag"], `${path} robots`).toContain("noindex");
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("デモユーザーは管理画面へ入れない", async ({ page }) => {
  await openDemo(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("ナビゲーションに一般ユーザー項目だけを表示する", async ({ page }, testInfo) => {
  await openDemo(page);
  const isMobile = testInfo.project.name === "mobile";
  if (isMobile) {
    await page.getByRole("button", { name: "メニューを開く" }).click();
  }
  const menu = isMobile
    ? page.getByRole("navigation", { name: "モバイルメニュー" })
    : page.locator("aside nav");
  await expect(menu.getByRole("link", { name: /ダッシュボード/ })).toBeVisible();
  await expect(menu.getByRole("link", { name: /設定/ })).toBeVisible();
  await expect(menu.getByRole("link", { name: /管理者メニュー/ })).toHaveCount(0);
});

test("通常ユーザーは項目別エラーを確認してサブスクを登録・編集・削除できる", async ({ page }) => {
  await openMember(page);
  await page.goto("/subscriptions/new");
  await page.getByRole("button", { name: "保存する" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "入力内容を確認してください" });
  await expect(alert).toContainText("サービス名を入力してください（100文字以内）。");
  await expect(alert).toContainText("次回更新日を正しい日付で入力してください。");

  await page.getByLabel("サービス名").fill("E2E Workflow Service");
  await page.getByLabel("料金", { exact: true }).fill("1280");
  await page.getByLabel("次回更新日").fill("2026-12-01");
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page).toHaveURL(/\/subscriptions\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "E2E Workflow Service", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "編集", exact: true }).click();
  await page.getByLabel("サービス名").fill("E2E Workflow Service Updated");
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByRole("heading", { name: "E2E Workflow Service Updated", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(page).toHaveURL(/\/subscriptions$/);
  await expect(page.getByText("E2E Workflow Service Updated", { exact: true })).toHaveCount(0);
});
