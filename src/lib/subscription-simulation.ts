import { z } from "zod";
import {
  MAX_CATEGORY_NAME_LENGTH,
  MAX_SUBSCRIPTION_NAME_LENGTH,
  MAX_SUBSCRIPTION_PRICE,
} from "./app-constants.ts";

export type SimulationItem = {
  id: string;
  monthlyCost: number;
};

export const virtualSubscriptionSchema = z.object({
  name: z.string().trim().min(1).max(MAX_SUBSCRIPTION_NAME_LENGTH),
  monthlyCost: z.coerce.number().int().min(0).max(MAX_SUBSCRIPTION_PRICE),
  categoryName: z.string().trim().max(MAX_CATEGORY_NAME_LENGTH),
});

export function calculateSimulationTotals(
  subscriptions: SimulationItem[],
  keptIds: ReadonlySet<string>,
  virtualSubscriptions: SimulationItem[],
) {
  const currentMonthlyTotal = subscriptions.reduce(
    (total, subscription) => total + subscription.monthlyCost,
    0,
  );
  const keptMonthlyTotal = subscriptions
    .filter((subscription) => keptIds.has(subscription.id))
    .reduce((total, subscription) => total + subscription.monthlyCost, 0);
  const addedMonthlyTotal = virtualSubscriptions.reduce(
    (total, subscription) => total + subscription.monthlyCost,
    0,
  );
  const simulatedMonthlyTotal = keptMonthlyTotal + addedMonthlyTotal;

  return {
    currentMonthlyTotal,
    simulatedMonthlyTotal,
    monthlyDifference: currentMonthlyTotal - simulatedMonthlyTotal,
  };
}
