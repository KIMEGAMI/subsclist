export const DUPLICATE_CATEGORY_MINIMUM_COUNT = 2;

export type CategoryDuplicateInput = {
  id: string;
  name: string;
  categoryName: string | null;
  monthlyCost: number;
  usageDays30: number;
};

export type CategoryDuplicateGroup = {
  categoryName: string;
  monthlyCost: number;
  subscriptions: CategoryDuplicateInput[];
};

export function detectCategoryDuplicates(items: CategoryDuplicateInput[]): CategoryDuplicateGroup[] {
  const groups = items.reduce<Map<string, CategoryDuplicateInput[]>>((byCategory, item) => {
    if (!item.categoryName) return byCategory;
    const subscriptions = byCategory.get(item.categoryName) ?? [];
    subscriptions.push(item);
    byCategory.set(item.categoryName, subscriptions);
    return byCategory;
  }, new Map<string, CategoryDuplicateInput[]>());

  return Array.from(groups.entries())
    .filter(([, subscriptions]) => subscriptions.length >= DUPLICATE_CATEGORY_MINIMUM_COUNT)
    .map(([categoryName, subscriptions]) => ({
      categoryName,
      monthlyCost: subscriptions.reduce((total, subscription) => total + subscription.monthlyCost, 0),
      subscriptions: [...subscriptions].sort((left, right) => left.usageDays30 - right.usageDays30 || right.monthlyCost - left.monthlyCost),
    }))
    .sort((left, right) => right.monthlyCost - left.monthlyCost);
}
