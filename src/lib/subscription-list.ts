import { MAX_SUBSCRIPTION_NAME_LENGTH } from "./app-constants.ts";

export const SUBSCRIPTION_LIST_QUERY_MAX_LENGTH = MAX_SUBSCRIPTION_NAME_LENGTH;

export const subscriptionListStatuses = ["ALL", "ACTIVE", "PAUSED", "CANCELED"] as const;
export const subscriptionListDataStates = [
  "ALL",
  "NEEDS_SETUP",
  "MISSING_CANCELLATION",
  "REVIEW_DUE",
] as const;
export const subscriptionListSorts = ["RENEWAL", "COST_DESC", "NAME"] as const;

export type SubscriptionListStatus = (typeof subscriptionListStatuses)[number];
export type SubscriptionListDataState = (typeof subscriptionListDataStates)[number];
export type SubscriptionListSort = (typeof subscriptionListSorts)[number];

export type SubscriptionListFilters = {
  query: string;
  status: SubscriptionListStatus;
  categoryId: string;
  dataState: SubscriptionListDataState;
  sort: SubscriptionListSort;
};

export type SubscriptionListItem = {
  id: string;
  name: string;
  memo: string | null;
  status: string;
  categoryId: string | null;
  categoryName: string | null;
  paymentMethodName: string | null;
  cancellationRouteReady: boolean;
  setupComplete: boolean;
  reviewDue: boolean;
  nextBillingDate: Date;
  monthlyCost: number;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function allowedValue<T extends string>(value: string, allowed: readonly T[], fallback: T) {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeSubscriptionListFilters(raw: RawSearchParams): SubscriptionListFilters {
  return {
    query: firstValue(raw.q).trim().slice(0, SUBSCRIPTION_LIST_QUERY_MAX_LENGTH),
    status: allowedValue(firstValue(raw.status), subscriptionListStatuses, "ALL"),
    categoryId: firstValue(raw.category).trim().slice(0, MAX_SUBSCRIPTION_NAME_LENGTH),
    dataState: allowedValue(firstValue(raw.data), subscriptionListDataStates, "ALL"),
    sort: allowedValue(firstValue(raw.sort), subscriptionListSorts, "RENEWAL"),
  };
}

function normalizedText(value: string | null) {
  return (value ?? "").normalize("NFKC").toLocaleLowerCase("ja-JP");
}

function matchesDataState(item: SubscriptionListItem, dataState: SubscriptionListDataState) {
  if (dataState === "NEEDS_SETUP") return !item.setupComplete;
  if (dataState === "MISSING_CANCELLATION") return !item.cancellationRouteReady;
  if (dataState === "REVIEW_DUE") return item.reviewDue;
  return true;
}

export function filterAndSortSubscriptions<T extends SubscriptionListItem>(
  items: T[],
  filters: SubscriptionListFilters,
) {
  const query = normalizedText(filters.query);
  const filtered = items.filter((item) => {
    const searchable = [item.name, item.memo, item.categoryName, item.paymentMethodName]
      .map(normalizedText)
      .join("\n");
    return (!query || searchable.includes(query))
      && (filters.status === "ALL" || item.status === filters.status)
      && (!filters.categoryId || item.categoryId === filters.categoryId)
      && matchesDataState(item, filters.dataState);
  });

  return filtered.sort((left, right) => {
    if (filters.sort === "COST_DESC") {
      return right.monthlyCost - left.monthlyCost || left.name.localeCompare(right.name, "ja");
    }
    if (filters.sort === "NAME") return left.name.localeCompare(right.name, "ja");
    return left.nextBillingDate.getTime() - right.nextBillingDate.getTime()
      || left.name.localeCompare(right.name, "ja");
  });
}

export function hasSubscriptionListFilters(filters: SubscriptionListFilters) {
  return Boolean(filters.query)
    || filters.status !== "ALL"
    || Boolean(filters.categoryId)
    || filters.dataState !== "ALL"
    || filters.sort !== "RENEWAL";
}
