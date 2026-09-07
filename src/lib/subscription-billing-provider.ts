export const BILLING_PROVIDER_VALUES = [
  "DIRECT",
  "APPLE_APP_STORE",
  "GOOGLE_PLAY",
  "AMAZON",
  "PAYPAL",
  "MOBILE_CARRIER",
  "OTHER",
] as const;

export type BillingProvider = (typeof BILLING_PROVIDER_VALUES)[number];

export type BillingProviderGuide = {
  value: BillingProvider;
  label: string;
  managementUrl: string | null;
  description: string;
  steps: readonly string[];
};

const guides: Record<BillingProvider, BillingProviderGuide> = {
  DIRECT: {
    value: "DIRECT",
    label: "サービスへ直接契約",
    managementUrl: null,
    description: "登録したサービスのアカウント画面または解約URLから手続きします。",
    steps: ["契約したサービスへログイン", "契約・プラン管理を開く", "解約完了画面と受付メールを保存"],
  },
  APPLE_APP_STORE: {
    value: "APPLE_APP_STORE",
    label: "Apple App Store",
    managementUrl: "https://apps.apple.com/account/subscriptions",
    description: "サービス側ではなく、契約に使ったApple Accountのサブスクリプション画面で管理します。",
    steps: ["契約に使ったApple Accountを確認", "対象のサブスクリプションを選択", "キャンセル後の終了日を確認"],
  },
  GOOGLE_PLAY: {
    value: "GOOGLE_PLAY",
    label: "Google Play",
    managementUrl: "https://play.google.com/store/account/subscriptions",
    description: "サービス側ではなく、契約に使ったGoogleアカウントの定期購入画面で管理します。",
    steps: ["契約に使ったGoogleアカウントを確認", "対象の定期購入を選択", "解約後の利用終了日を確認"],
  },
  AMAZON: {
    value: "AMAZON",
    label: "Amazon",
    managementUrl: "https://www.amazon.co.jp/hz5/yourmembershipsandsubscriptions",
    description: "Amazon経由の会員資格・定期購読はAmazonアカウントから管理します。",
    steps: ["契約に使ったAmazonアカウントを確認", "メンバーシップおよび購読を開く", "自動更新停止と終了日を確認"],
  },
  PAYPAL: {
    value: "PAYPAL",
    label: "PayPal自動支払い",
    managementUrl: "https://www.paypal.com/myaccount/autopay/",
    description: "PayPalの自動支払いとして登録された契約は、PayPalアカウントで売り手ごとに管理します。",
    steps: ["PayPalへログイン", "対象の自動支払いを選択", "キャンセル状態と最終支払日を確認"],
  },
  MOBILE_CARRIER: {
    value: "MOBILE_CARRIER",
    label: "携帯電話会社決済",
    managementUrl: null,
    description: "契約に使った携帯電話会社の継続課金・コンテンツ決済画面で管理します。",
    steps: ["請求明細から携帯電話会社を確認", "継続課金・コンテンツ決済を開く", "解除受付番号と終了日を保存"],
  },
  OTHER: {
    value: "OTHER",
    label: "その他の請求元",
    managementUrl: null,
    description: "領収書やカード明細で実際の請求元を確認してから手続きします。",
    steps: ["領収書・明細で請求元を特定", "請求元の契約管理画面を開く", "解約証跡と利用終了日を保存"],
  },
};

const csvAliases = new Map<string, BillingProvider>([
  ["direct", "DIRECT"],
  ["サービスへ直接契約", "DIRECT"],
  ["直接契約", "DIRECT"],
  ["apple_app_store", "APPLE_APP_STORE"],
  ["apple app store", "APPLE_APP_STORE"],
  ["app store", "APPLE_APP_STORE"],
  ["google_play", "GOOGLE_PLAY"],
  ["google play", "GOOGLE_PLAY"],
  ["amazon", "AMAZON"],
  ["paypal", "PAYPAL"],
  ["paypal自動支払い", "PAYPAL"],
  ["mobile_carrier", "MOBILE_CARRIER"],
  ["携帯電話会社決済", "MOBILE_CARRIER"],
  ["キャリア決済", "MOBILE_CARRIER"],
  ["other", "OTHER"],
  ["その他の請求元", "OTHER"],
  ["その他", "OTHER"],
]);

export function isBillingProvider(value: string): value is BillingProvider {
  return (BILLING_PROVIDER_VALUES as readonly string[]).includes(value);
}

export function billingProviderGuide(value: string): BillingProviderGuide {
  return guides[isBillingProvider(value) ? value : "OTHER"];
}

export function billingProviderLabel(value: string) {
  return billingProviderGuide(value).label;
}

export function parseBillingProvider(value: string): BillingProvider | null {
  const normalized = value.trim();
  if (!normalized) return "DIRECT";
  if (isBillingProvider(normalized)) return normalized;
  return csvAliases.get(normalized.toLowerCase()) ?? null;
}
