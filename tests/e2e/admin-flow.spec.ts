import { expect, test } from "@playwright/test";

test("管理者は管理者メニューと設定だけを利用できる", async ({ page }, testInfo) => {
  const email = process.env.E2E_ADMIN_EMAIL ?? "";
  const password = process.env.E2E_USER_PASSWORD ?? "";
  expect(email).not.toBe("");
  expect(password).not.toBe("");

  await page.goto("/login");
  await page.getByRole("textbox", { name: "メールアドレス" }).fill(email);
  await page.getByRole("textbox", { name: "パスワード" }).fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const navigation = testInfo.project.name === "mobile"
    ? page.getByRole("navigation", { name: "モバイルメニュー" })
    : page.locator("aside nav");
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "メニューを開く" }).click();
  }
  await expect(navigation.getByRole("link", { name: /管理者メニュー/ })).toBeVisible();
  await expect(navigation.getByRole("link", { name: /設定/ })).toBeVisible();
  await expect(navigation.getByRole("link", { name: /ダッシュボード/ })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: /サブスク/ })).toHaveCount(0);

  await navigation.getByRole("link", { name: /設定/ }).click();
  await expect(page.getByRole("button", { name: "ログアウト", exact: true })).toBeVisible();
});

test("管理者はメンテナンスを切り替え、一般ユーザーだけを遮断できる", async ({ browser, page }) => {
  const email = process.env.E2E_ADMIN_EMAIL ?? "";
  const password = process.env.E2E_USER_PASSWORD ?? "";
  await page.goto("/login");
  await page.getByRole("textbox", { name: "メールアドレス" }).fill(email);
  await page.getByRole("textbox", { name: "パスワード" }).fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole("button", { name: "メンテナンス中にする" }).click();
  await expect(page.getByText("メンテナンス中", { exact: true }).first()).toBeVisible();

  const memberContext = await browser.newContext();
  try {
    const demoLogin = await memberContext.request.post("/api/auth/demo-login", {
      headers: { origin: "http://127.0.0.1:3100" },
    });
    expect(demoLogin.ok()).toBe(true);
    const memberPage = await memberContext.newPage();
    await memberPage.goto("/dashboard");
    await expect(memberPage).toHaveURL(/\/maintenance$/);
    await expect(memberPage.getByRole("heading", { name: "ただいまメンテナンス中です" })).toBeVisible();
  } finally {
    await memberContext.close();
    await page.goto("/admin");
    await page.getByRole("button", { name: "通常モードに戻す" }).click();
    await expect(page.getByText("通常モード", { exact: true }).first()).toBeVisible();
  }
});
