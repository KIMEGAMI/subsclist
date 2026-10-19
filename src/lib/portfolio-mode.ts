export function portfolioFreeModeEnabled(value = process.env.SUBSCLIST_FREE_PORTFOLIO) {
  return value === "true";
}

export function hasPremiumAccess(plan: string | null | undefined, freeMode: boolean) {
  return freeMode || plan === "PREMIUM" || plan === "LIFETIME";
}
