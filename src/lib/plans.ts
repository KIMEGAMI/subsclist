export const FREE_SUBSCRIPTION_LIMIT = 10;
export const FREE_CATEGORY_LIMIT = 5;

export function isPremiumPlan(plan?: string | null) {
  return plan === "PREMIUM";
}

export function limitByPlan<T>(items: T[], plan?: string | null, limit = FREE_SUBSCRIPTION_LIMIT) {
  return isPremiumPlan(plan) ? items : items.slice(0, limit);
}

export function hiddenByPlan(total: number, plan?: string | null, limit = FREE_SUBSCRIPTION_LIMIT) {
  return isPremiumPlan(plan) ? 0 : Math.max(0, total - limit);
}