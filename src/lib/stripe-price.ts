export type PremiumPriceValidationError =
  | "inactive"
  | "not_recurring"
  | "not_monthly"
  | "wrong_currency"
  | "wrong_amount"
  | "metered";

type StripePriceForValidation = {
  active: boolean;
  currency: string;
  unit_amount: number | null;
  recurring: {
    interval: string;
    interval_count: number;
    usage_type: string;
  } | null;
};

export function validatePremiumStripePrice(
  price: StripePriceForValidation,
  expectedAmountYen: number,
): PremiumPriceValidationError | null {
  if (!price.active) return "inactive";
  if (!price.recurring) return "not_recurring";
  if (
    price.recurring.interval !== "month" ||
    price.recurring.interval_count !== 1
  ) {
    return "not_monthly";
  }
  if (price.currency.toLowerCase() !== "jpy") return "wrong_currency";
  if (price.unit_amount !== expectedAmountYen) return "wrong_amount";
  if (price.recurring.usage_type !== "licensed") return "metered";
  return null;
}
