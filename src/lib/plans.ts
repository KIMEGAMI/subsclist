export { FREE_CATEGORY_LIMIT, FREE_SUBSCRIPTION_LIMIT } from "@/lib/app-constants";
import { FREE_SUBSCRIPTION_LIMIT } from "@/lib/app-constants";
import { hasPremiumAccess, portfolioFreeModeEnabled } from "@/lib/portfolio-mode";

export { hasPremiumAccess, portfolioFreeModeEnabled };
export const PORTFOLIO_FREE_MODE = portfolioFreeModeEnabled();

export function isPremiumPlan(plan?: string | null) {
  return hasPremiumAccess(plan, PORTFOLIO_FREE_MODE);
}

export function limitByPlan<T>(items: T[], plan?: string | null, limit = FREE_SUBSCRIPTION_LIMIT) {
  return isPremiumPlan(plan) ? items : items.slice(0, limit);
}

export function hiddenByPlan(total: number, plan?: string | null, limit = FREE_SUBSCRIPTION_LIMIT) {
  return isPremiumPlan(plan) ? 0 : Math.max(0, total - limit);
}
