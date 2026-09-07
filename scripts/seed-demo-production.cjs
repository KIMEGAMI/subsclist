/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const mariadb = require("mariadb");

const demoEmail = process.env.DEMO_USER_EMAIL || "user@shinji.work";
const demoUserId = "demo_user_shinji_work";

function readEnv() {
  const envPath = path.join(process.cwd(), ".env");
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, "");
    env[key] = value;
  }
  return env;
}

function databaseConfig(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: Number(url.port || "3306"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    charset: "utf8mb4",
  };
}

async function one(connection, sql, params) {
  const rows = await connection.query(sql, params);
  return rows[0] || null;
}

async function ensureUser(connection, demoPassword) {
  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const existing = await one(connection, "SELECT id FROM User WHERE email = ? LIMIT 1", [demoEmail]);
  if (existing) {
    await connection.query(
      "UPDATE User SET name = ?, emailVerified = NOW(), passwordHash = ?, plan = 'PREMIUM', updatedAt = NOW() WHERE id = ?",
      ["デモユーザー", passwordHash, existing.id],
    );
    return existing.id;
  }

  await connection.query(
    "INSERT INTO User (id, name, email, emailVerified, passwordHash, plan, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), ?, 'PREMIUM', NOW(), NOW())",
    [demoUserId, "デモユーザー", demoEmail, passwordHash],
  );
  return demoUserId;
}

async function upsertCategory(connection, userId, id, name, color) {
  const existing = await one(connection, "SELECT id FROM Category WHERE userId = ? AND name = ? LIMIT 1", [userId, name]);
  if (existing) {
    await connection.query("UPDATE Category SET color = ?, updatedAt = NOW() WHERE id = ?", [color, existing.id]);
    return existing.id;
  }
  await connection.query(
    "INSERT INTO Category (id, userId, name, color, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW())",
    [id, userId, name, color],
  );
  return id;
}

async function upsertPaymentMethod(connection, userId, id, name, type, memo = null) {
  const existing = await one(connection, "SELECT id FROM PaymentMethod WHERE id = ? LIMIT 1", [id]);
  if (existing) {
    await connection.query("UPDATE PaymentMethod SET name = ?, type = ?, memo = ?, updatedAt = NOW() WHERE id = ?", [name, type, memo, id]);
    return id;
  }
  await connection.query(
    "INSERT INTO PaymentMethod (id, userId, name, type, memo, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
    [id, userId, name, type, memo],
  );
  return id;
}

async function upsertSubscription(connection, userId, item) {
  const existing = await one(connection, "SELECT id FROM Subscription WHERE id = ? LIMIT 1", [item.id]);
  const values = [
    item.categoryId,
    item.paymentMethodId,
    item.name,
    item.price,
    item.billingCycle,
    item.nextBillingDate,
    item.status || "ACTIVE",
    item.memo || null,
    item.serviceUrl || null,
    item.cancellationUrl || null,
    item.trialEndsAt || null,
    item.cancellationDeadline || null,
    item.lastReviewedAt || null,
    item.notifyDaysBefore ?? 7,
    item.usageFrequency || "UNKNOWN",
    item.priority || "UNKNOWN",
    item.businessUsePercent ?? 0,
    item.logoUrl || null,
    item.cancellationStatus || "NONE",
    item.plannedCancelAt || null,
    item.cancellationMemo || null,
    item.cancellationCompletedAt || null,
  ];
  if (existing) {
    await connection.query(
      "UPDATE Subscription SET categoryId = ?, paymentMethodId = ?, name = ?, price = ?, billingCycle = ?, nextBillingDate = ?, status = ?, memo = ?, serviceUrl = ?, cancellationUrl = ?, trialEndsAt = ?, cancellationDeadline = ?, lastReviewedAt = ?, notifyDaysBefore = ?, usageFrequency = ?, priority = ?, businessUsePercent = ?, logoUrl = ?, cancellationStatus = ?, plannedCancelAt = ?, cancellationMemo = ?, cancellationCompletedAt = ?, deletedAt = NULL, updatedAt = NOW() WHERE id = ?",
      [...values, item.id],
    );
    return item.id;
  }
  await connection.query(
    "INSERT INTO Subscription (id, userId, categoryId, paymentMethodId, name, price, currency, billingCycle, nextBillingDate, status, memo, serviceUrl, cancellationUrl, trialEndsAt, cancellationDeadline, lastReviewedAt, notifyDaysBefore, usageFrequency, priority, businessUsePercent, logoUrl, cancellationStatus, plannedCancelAt, cancellationMemo, cancellationCompletedAt, createdAt, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, 'JPY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL)",
    [item.id, userId, ...values],
  );
  return item.id;
}

function dateAtDay(year, month, day) {
  const last = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")} 10:00:00`;
}

function monthsBetween(startKey, endKey) {
  const [startYear, startMonth] = startKey.split("-").map(Number);
  const [endYear, endMonth] = endKey.split("-").map(Number);
  const months = [];
  const cursor = new Date(startYear, startMonth - 1, 1);
  const end = new Date(endYear, endMonth - 1, 1);
  while (cursor <= end) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function shouldCreatePayment(subscription, month) {
  if (subscription.billingCycle === "MONTHLY") return true;
  if (subscription.billingCycle === "YEARLY") return month.month === new Date(subscription.nextBillingDate).getMonth() + 1;
  if (subscription.billingCycle === "WEEKLY") return true;
  return true;
}

async function seedPaymentHistories(connection, userId, subscriptions) {
  const months = monthsBetween("2025-01", "2026-06");
  let inserted = 0;
  let skipped = 0;
  for (const subscription of subscriptions) {
    const day = new Date(subscription.nextBillingDate).getDate() || 10;
    for (const month of months) {
      if (!shouldCreatePayment(subscription, month)) continue;
      const id = `demo_hist_${subscription.id}_${month.year}${String(month.month).padStart(2, "0")}`;
      const existing = await one(connection, "SELECT id FROM PaymentHistory WHERE id = ? LIMIT 1", [id]);
      if (existing) {
        skipped++;
        continue;
      }
      await connection.query(
        "INSERT INTO PaymentHistory (id, subscriptionId, userId, amount, paidAt, subscriptionNameSnapshot, memo, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
        [id, subscription.id, userId, subscription.price, dateAtDay(month.year, month.month, day), subscription.name, "demo payment history"],
      );
      inserted++;
    }
  }
  return { inserted, skipped };
}

async function seedCancellationWorkflow(connection, userId, subscriptionId) {
  const labels = ["契約アカウントを確認", "更新日前に解約手続き", "解約完了メールを保存", "次回請求が止まったか確認"];
  for (let index = 0; index < labels.length; index++) {
    const id = `demo_cancel_check_${index + 1}`;
    const existing = await one(connection, "SELECT id FROM CancellationChecklistItem WHERE id = ? LIMIT 1", [id]);
    if (existing) {
      await connection.query("UPDATE CancellationChecklistItem SET label = ?, sortOrder = ?, updatedAt = NOW() WHERE id = ?", [labels[index], index, id]);
      continue;
    }
    await connection.query(
      "INSERT INTO CancellationChecklistItem (id, subscriptionId, userId, label, sortOrder, completedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, NULL, NOW(), NOW())",
      [id, subscriptionId, userId, labels[index], index],
    );
  }

  const evidenceId = "demo_cancel_evidence_1";
  const existingEvidence = await one(connection, "SELECT id FROM CancellationEvidence WHERE id = ? LIMIT 1", [evidenceId]);
  if (existingEvidence) {
    await connection.query("UPDATE CancellationEvidence SET title = ?, kind = ?, memo = ?, updatedAt = NOW() WHERE id = ?", ["解約手順ページ確認", "URL", "demo evidence", evidenceId]);
    return;
  }
  await connection.query(
    "INSERT INTO CancellationEvidence (id, subscriptionId, userId, title, kind, referenceUrl, memo, recordedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())",
    [evidenceId, subscriptionId, userId, "解約手順ページ確認", "URL", "https://account.adobe.com/plans", "demo evidence"],
  );
}

async function main() {
  const env = { ...readEnv(), ...process.env };
  const demoPassword = env.DEMO_USER_PASSWORD;
  if (!demoPassword) throw new Error("DEMO_USER_PASSWORD is not set.");
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const connection = await mariadb.createConnection(databaseConfig(env.DATABASE_URL));

  try {
    await connection.beginTransaction();
    const userId = await ensureUser(connection, demoPassword);

    await connection.query(
      "INSERT INTO UserPreference (id, userId, monthlyBudget, defaultNotifyDaysBefore, notificationHour, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE monthlyBudget = VALUES(monthlyBudget), defaultNotifyDaysBefore = VALUES(defaultNotifyDaysBefore), notificationHour = VALUES(notificationHour), updatedAt = NOW()",
      ["demo_pref_shinji", userId, 18000, 7, 9],
    );

    const categoryIds = {
      entertainment: await upsertCategory(connection, userId, "demo_cat_entertainment", "エンタメ", "#7c3aed"),
      productivity: await upsertCategory(connection, userId, "demo_cat_productivity", "仕事効率化", "#2563eb"),
      ai: await upsertCategory(connection, userId, "demo_cat_ai", "AI", "#db2777"),
      storage: await upsertCategory(connection, userId, "demo_cat_storage", "ストレージ", "#0891b2"),
      money: await upsertCategory(connection, userId, "demo_cat_money", "家計・会計", "#16a34a"),
      communication: await upsertCategory(connection, userId, "demo_cat_communication", "コミュニケーション", "#f97316"),
    };

    const paymentMethodIds = {
      visa: await upsertPaymentMethod(connection, userId, "demo_pay_visa", "三井住友Visa", "CREDIT_CARD", "demo card"),
      paypay: await upsertPaymentMethod(connection, userId, "demo_pay_paypay", "PayPay", "PAYPAY", "demo wallet"),
      apple: await upsertPaymentMethod(connection, userId, "demo_pay_apple", "Apple Pay", "APPLE_PAY", "demo wallet"),
      bank: await upsertPaymentMethod(connection, userId, "demo_pay_bank", "住信SBIネット銀行", "BANK", "demo bank"),
    };

    const subscriptions = [
      { id: "demo_sub_netflix", name: "Netflix スタンダード", price: 1590, billingCycle: "MONTHLY", nextBillingDate: "2026-07-05 10:00:00", categoryId: categoryIds.entertainment, paymentMethodId: paymentMethodIds.visa, serviceUrl: "https://www.netflix.com/", cancellationUrl: "https://help.netflix.com/ja/node/407", usageFrequency: "WEEKLY", priority: "USEFUL", cancellationStatus: "CONSIDERING", cancellationMemo: "家族利用が少ない月は見直し候補" },
      { id: "demo_sub_spotify", name: "Spotify Premium", price: 1080, billingCycle: "MONTHLY", nextBillingDate: "2026-07-12 10:00:00", categoryId: categoryIds.entertainment, paymentMethodId: paymentMethodIds.paypay, serviceUrl: "https://www.spotify.com/jp/premium/", cancellationUrl: "https://support.spotify.com/jp/article/cancel-premium/", usageFrequency: "DAILY", priority: "USEFUL" },
      { id: "demo_sub_youtube", name: "YouTube Premium", price: 1280, billingCycle: "MONTHLY", nextBillingDate: "2026-07-18 10:00:00", categoryId: categoryIds.entertainment, paymentMethodId: paymentMethodIds.visa, serviceUrl: "https://www.youtube.com/premium", cancellationUrl: "https://support.google.com/youtube/answer/6308278", usageFrequency: "DAILY", priority: "ESSENTIAL" },
      { id: "demo_sub_amazon_prime", name: "Amazon Prime", price: 5900, billingCycle: "YEARLY", nextBillingDate: "2026-10-03 10:00:00", categoryId: categoryIds.entertainment, paymentMethodId: paymentMethodIds.visa, serviceUrl: "https://www.amazon.co.jp/amazonprime", cancellationUrl: "https://www.amazon.co.jp/gp/primecentral", usageFrequency: "WEEKLY", priority: "ESSENTIAL" },
      { id: "demo_sub_chatgpt", name: "ChatGPT Plus", price: 3200, billingCycle: "MONTHLY", nextBillingDate: "2026-07-01 10:00:00", categoryId: categoryIds.ai, paymentMethodId: paymentMethodIds.visa, serviceUrl: "https://chatgpt.com/", cancellationUrl: "https://help.openai.com/", usageFrequency: "DAILY", priority: "ESSENTIAL" },
      { id: "demo_sub_copilot", name: "GitHub Copilot", price: 1600, billingCycle: "MONTHLY", nextBillingDate: "2026-07-09 10:00:00", categoryId: categoryIds.ai, paymentMethodId: paymentMethodIds.visa, serviceUrl: "https://github.com/features/copilot", cancellationUrl: "https://docs.github.com/billing/managing-billing-for-github-copilot", usageFrequency: "DAILY", priority: "ESSENTIAL" },
      { id: "demo_sub_m365", name: "Microsoft 365 Personal", price: 1490, billingCycle: "MONTHLY", nextBillingDate: "2026-07-20 10:00:00", categoryId: categoryIds.productivity, paymentMethodId: paymentMethodIds.visa, serviceUrl: "https://www.microsoft.com/ja-jp/microsoft-365", cancellationUrl: "https://account.microsoft.com/services", usageFrequency: "WEEKLY", priority: "USEFUL" },
      { id: "demo_sub_adobe", name: "Adobe Creative Cloud", price: 7280, billingCycle: "MONTHLY", nextBillingDate: "2026-07-23 10:00:00", categoryId: categoryIds.productivity, paymentMethodId: paymentMethodIds.visa, serviceUrl: "https://www.adobe.com/jp/creativecloud.html", cancellationUrl: "https://account.adobe.com/plans", usageFrequency: "MONTHLY", priority: "OPTIONAL", cancellationStatus: "PLANNED", plannedCancelAt: "2026-07-22 10:00:00", cancellationDeadline: "2026-07-22 10:00:00", cancellationMemo: "利用頻度が低いので月末までに見直し" },
      { id: "demo_sub_notion", name: "Notion Plus", price: 1600, billingCycle: "MONTHLY", nextBillingDate: "2026-07-15 10:00:00", categoryId: categoryIds.productivity, paymentMethodId: paymentMethodIds.visa, serviceUrl: "https://www.notion.so/pricing", cancellationUrl: "https://www.notion.so/help", usageFrequency: "DAILY", priority: "ESSENTIAL" },
      { id: "demo_sub_canva", name: "Canva Pro", price: 1180, billingCycle: "MONTHLY", nextBillingDate: "2026-07-27 10:00:00", categoryId: categoryIds.productivity, paymentMethodId: paymentMethodIds.paypay, serviceUrl: "https://www.canva.com/ja_jp/pro/", cancellationUrl: "https://www.canva.com/help/cancel-canva-pro/", usageFrequency: "MONTHLY", priority: "OPTIONAL" },
      { id: "demo_sub_dropbox", name: "Dropbox Plus", price: 1500, billingCycle: "MONTHLY", nextBillingDate: "2026-07-07 10:00:00", categoryId: categoryIds.storage, paymentMethodId: paymentMethodIds.apple, serviceUrl: "https://www.dropbox.com/plans", cancellationUrl: "https://help.dropbox.com/plans/cancel-subscription", usageFrequency: "WEEKLY", priority: "USEFUL" },
      { id: "demo_sub_icloud", name: "iCloud+ 2TB", price: 1500, billingCycle: "MONTHLY", nextBillingDate: "2026-07-02 10:00:00", categoryId: categoryIds.storage, paymentMethodId: paymentMethodIds.apple, serviceUrl: "https://www.apple.com/jp/icloud/", cancellationUrl: "https://support.apple.com/ja-jp/HT207594", usageFrequency: "DAILY", priority: "ESSENTIAL" },
      { id: "demo_sub_moneyforward", name: "マネーフォワード ME", price: 500, billingCycle: "MONTHLY", nextBillingDate: "2026-07-14 10:00:00", categoryId: categoryIds.money, paymentMethodId: paymentMethodIds.bank, serviceUrl: "https://moneyforward.com/", cancellationUrl: "https://support.me.moneyforward.com/", usageFrequency: "WEEKLY", priority: "USEFUL" },
      { id: "demo_sub_zoom", name: "Zoom Pro", price: 2125, billingCycle: "MONTHLY", nextBillingDate: "2026-07-25 10:00:00", categoryId: categoryIds.communication, paymentMethodId: paymentMethodIds.visa, serviceUrl: "https://zoom.us/pricing", cancellationUrl: "https://support.zoom.com/", usageFrequency: "MONTHLY", priority: "OPTIONAL" },
    ];

    const businessUseBySubscriptionId = new Map([
      ["demo_sub_chatgpt", 100],
      ["demo_sub_copilot", 100],
      ["demo_sub_m365", 80],
      ["demo_sub_adobe", 100],
      ["demo_sub_notion", 100],
      ["demo_sub_canva", 70],
      ["demo_sub_dropbox", 60],
      ["demo_sub_zoom", 100],
    ]);

    for (const subscription of subscriptions) {
      subscription.businessUsePercent = businessUseBySubscriptionId.get(subscription.id) ?? 0;
      await upsertSubscription(connection, userId, subscription);
      const noticeId = `demo_notice_${subscription.id}`;
      const existingNotice = await one(connection, "SELECT id FROM NotificationSetting WHERE id = ? LIMIT 1", [noticeId]);
      if (existingNotice) {
        await connection.query("UPDATE NotificationSetting SET daysBefore = ?, enabled = true, updatedAt = NOW() WHERE id = ?", [subscription.notifyDaysBefore ?? 7, noticeId]);
      } else {
        await connection.query(
          "INSERT INTO NotificationSetting (id, userId, subscriptionId, daysBefore, enabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, true, NOW(), NOW())",
          [noticeId, userId, subscription.id, subscription.notifyDaysBefore ?? 7],
        );
      }
    }

    const historyResult = await seedPaymentHistories(connection, userId, subscriptions);
    await seedCancellationWorkflow(connection, userId, "demo_sub_adobe");
    await connection.commit();

    console.log(JSON.stringify({ user: demoEmail, subscriptions: subscriptions.length, paymentHistories: historyResult }, null, 2));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
