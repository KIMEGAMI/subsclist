import { expect, test } from "@playwright/test";
import { AUTH_FLOW_TIMEOUT_MS } from "./constants";

test("管理者は管理者メニューと設定だけを利用できる", async ({ page }, testInfo) => {
  const email = process.env.E2E_ADMIN_EMAIL ?? "";
  const password = process.env.E2E_USER_PASSWORD ?? "";
  expect(email).not.toBe("");
  expect(password).not.toBe("");

  await page.goto("/login");
  await page.getByRole("textbox", { name: "メールアドレス" }).fill(email);
  await page.getByRole("textbox", { name: "パスワード" }).fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: AUTH_FLOW_TIMEOUT_MS });

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
  await expect(page).toHaveURL(/\/admin$/, { timeout: AUTH_FLOW_TIMEOUT_MS });

  await page.getByRole("button", { name: "メンテナンス中にする" }).click();
  await expect(page.getByText("メンテナンス中", { exact: true }).first()).toBeVisible();

  const guestContext = await browser.newContext();
  try {
    const guestPage = await guestContext.newPage();
    for (const path of ["/", "/pricing", "/faq"]) {
      await guestPage.goto(path);
      await expect(guestPage).toHaveURL(/\/maintenance$/);
      await expect(guestPage.getByRole("heading", { name: "ただいまメンテナンス中です" })).toBeVisible();
    }
    await guestPage.goto("/maintenance");
    await expect(guestPage.getByRole("link", { name: "管理画面へ" })).toHaveCount(0);
    await guestPage.getByRole("link", { name: "管理者ログインへ" }).click();
    await expect(guestPage).toHaveURL(/\/login\?admin=1$/);
    await expect(guestPage.getByRole("heading", { name: "管理者ログイン" })).toBeVisible();
    await expect(guestPage.getByRole("textbox", { name: "メールアドレス" })).toBeVisible();
    const contact = await guestContext.request.get("/api/contact");
    expect(contact.status()).toBe(503);
    const privateApi = await guestContext.request.get("/api/today");
    expect(privateApi.status()).toBe(503);
  } finally {
    await guestContext.close();
  }

  const memberContext = await browser.newContext();
  try {
    const demoLogin = await memberContext.request.post("/api/auth/demo-login", {
      headers: { origin: "http://127.0.0.1:3100" },
    });
    expect(demoLogin.ok()).toBe(true);
    const privateApi = await memberContext.request.get("/api/today");
    expect(privateApi.status()).toBe(503);
    const memberPage = await memberContext.newPage();
    await memberPage.goto("/dashboard");
    await expect(memberPage).toHaveURL(/\/maintenance$/);
    await expect(memberPage.getByRole("heading", { name: "ただいまメンテナンス中です" })).toBeVisible();
    await memberPage.getByRole("link", { name: "管理者ログインへ" }).click();
    await expect(memberPage).toHaveURL(/\/login\?admin=1$/);
    await expect(memberPage.getByRole("heading", { name: "管理者ログイン" })).toBeVisible();
    await memberPage.getByRole("textbox", { name: "メールアドレス" }).fill(process.env.E2E_MEMBER_EMAIL ?? "");
    await memberPage.getByRole("textbox", { name: "パスワード" }).fill(password);
    await memberPage.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(memberPage.getByText("ログイン情報が正しくありません。")).toBeVisible();
    await expect(memberPage).toHaveURL(/\/login\?admin=1$/);
  } finally {
    await memberContext.close();
  }

  await page.goto("/maintenance");
  await expect(page).toHaveURL(/\/admin$/, { timeout: AUTH_FLOW_TIMEOUT_MS });
  await expect(page.getByRole("button", { name: "通常モードに戻す" })).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: AUTH_FLOW_TIMEOUT_MS });
  await page.goto("/maintenance");
  await page.getByRole("link", { name: "管理者ログインへ" }).click();
  await expect(page).toHaveURL(/\/login\?admin=1$/);
  await expect(page.getByRole("heading", { name: "管理者ログイン" })).toBeVisible();
  await page.getByRole("textbox", { name: "メールアドレス" }).fill(email);
  await page.getByRole("textbox", { name: "パスワード" }).fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: AUTH_FLOW_TIMEOUT_MS });
  await expect(page.getByRole("button", { name: "通常モードに戻す" })).toBeVisible();
  await page.getByRole("button", { name: "通常モードに戻す" }).click();
  await expect(page.getByText("通常モード", { exact: true }).first()).toBeVisible();
});
