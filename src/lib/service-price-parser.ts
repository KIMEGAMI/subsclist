import { OFFICIAL_PRICE_MAX_RECORDS_PER_PAGE } from "./app-constants.ts";

export type OfficialPriceRecord = {
  planName: string;
  billingCycle: string;
  currency: string;
  amount: number;
  taxIncluded: boolean | null;
  effectiveAt: Date | null;
};

const MAX_PRICE = 10_000_000;
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function price(value: unknown) { const parsed = typeof value === "number" ? value : Number(text(value)); return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_PRICE ? parsed : null; }
function cycle(value: unknown): string | null {
  const normalized = text(value).toLowerCase();
  if (normalized.includes("year") || normalized.includes("annual") || /^p1y$/.test(normalized)) return "YEARLY";
  if (normalized.includes("quarter") || /^p3m$/.test(normalized)) return "QUARTERLY";
  if (normalized.includes("month") || /^p1m$/.test(normalized)) return "MONTHLY";
  if (normalized.includes("week") || /^p1w$/.test(normalized)) return "WEEKLY";
  if (normalized.includes("day") || /^p1d$/.test(normalized)) return "DAILY";
  return null;
}
function taxIncluded(value: unknown): boolean | null { if (typeof value === "boolean") return value; const normalized = text(value).toLowerCase(); if (["inclusive", "included", "税込", "tax included"].some((item) => normalized.includes(item))) return true; if (["exclusive", "excluded", "税別", "tax excluded"].some((item) => normalized.includes(item))) return false; return null; }
function collectOffers(value: unknown, inheritedName = "サービス"): OfficialPriceRecord[] {
  const records: OfficialPriceRecord[] = [];
  if (Array.isArray(value)) { for (const item of value) records.push(...collectOffers(item, inheritedName)); return records; }
  if (!isRecord(value)) return records;
  const name = text(value.name) || inheritedName;
  if (value.offers !== undefined) {
    for (const offer of Array.isArray(value.offers) ? value.offers : [value.offers]) {
      if (!isRecord(offer)) continue;
      const amount = price(offer.price); const currency = text(offer.priceCurrency).toUpperCase();
      if (amount === null || !/^[A-Z]{3}$/.test(currency)) continue;
      const billingCycle = cycle(offer.billingDuration ?? offer.billingPeriod ?? value.billingDuration);
      if (!billingCycle) continue;
      records.push({ planName: name.slice(0, 100) || "サービス", billingCycle, currency, amount, taxIncluded: taxIncluded(offer.description ?? value.description), effectiveAt: null });
    }
  }
  for (const [key, child] of Object.entries(value)) if (key !== "offers") records.push(...collectOffers(child, name));
  return records;
}

export function parseOfficialPriceJsonLd(html: string): OfficialPriceRecord[] {
  const records: OfficialPriceRecord[] = [];
  const scriptPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) { try { records.push(...collectOffers(JSON.parse(match[1]))); } catch { /* Ignore malformed blocks. */ } }
  const unique = new Map<string, OfficialPriceRecord>();
  for (const record of records) unique.set(`${record.planName}|${record.billingCycle}|${record.currency}|${record.amount}`, record);
  return [...unique.values()].slice(0, OFFICIAL_PRICE_MAX_RECORDS_PER_PAGE);
}
