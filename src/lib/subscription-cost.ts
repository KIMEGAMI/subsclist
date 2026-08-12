import { monthlyAmount } from "./billing.ts";

export type CostPerUsage = {
  monthlyCost: number;
  usageDays: number;
  costPerUsage: number | null;
};

export function calculateCostPerUsage(
  price: number,
  billingCycle: string,
  customCycleDays: number | null | undefined,
  usageDays: number,
): CostPerUsage {
  const monthlyCost = monthlyAmount(price, billingCycle, customCycleDays);
  const safeUsageDays = Math.max(0, usageDays);

  return {
    monthlyCost,
    usageDays: safeUsageDays,
    costPerUsage: safeUsageDays === 0 ? null : monthlyCost / safeUsageDays,
  };
}
