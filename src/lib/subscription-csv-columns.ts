export const SUBSCRIPTION_IMPORT_HEADERS = [
  "サービス名",
  "料金",
  "請求周期",
  "次回更新日",
  "カテゴリ",
  "支払い方法",
  "サービスURL",
  "解約URL",
  "メモ",
  "カスタム周期日数",
  "仕事利用割合",
  "請求元",
  "請求通貨",
  "原通貨額",
  "円換算レート",
  "換算レート確認日",
  "整理用初期科目",
] as const;

export type SubscriptionImportHeader =
  (typeof SUBSCRIPTION_IMPORT_HEADERS)[number];
export type SubscriptionImportValues = Record<SubscriptionImportHeader, string>;
