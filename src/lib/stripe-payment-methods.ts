export const stripePaymentMethodTypes = [
  "CREDIT_CARD",
  "DEBIT_CARD",
  "PREPAID_CARD",
  "CONVENIENCE_STORE",
  "BANK_TRANSFER",
  "PAYPAY",
] as const;

export type StripePaymentMethodType = (typeof stripePaymentMethodTypes)[number];

export const stripePaymentMethodLabels: Record<StripePaymentMethodType, string> = {
  CREDIT_CARD: "クレジットカード",
  DEBIT_CARD: "デビットカード",
  PREPAID_CARD: "プリペイドカード",
  CONVENIENCE_STORE: "コンビニ払い",
  BANK_TRANSFER: "銀行振込",
  PAYPAY: "PayPay",
};

export const stripePaymentMethodOptions = stripePaymentMethodTypes.map((value) => ({
  value,
  label: stripePaymentMethodLabels[value],
}));

export function paymentMethodTypeLabel(type: string) {
  return stripePaymentMethodLabels[type as StripePaymentMethodType] ?? type;
}
