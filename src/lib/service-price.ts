import { prisma } from "@/lib/prisma";
import { isAllowedPublicHttpsUrl } from "./external-url.ts";
import { parseOfficialPriceJsonLd } from "@/lib/service-price-parser";
import { fetchPublicHttpsText } from "@/lib/public-https-fetch";

const MAX_RESPONSE_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 10_000;

export function isAllowedPricingUrl(value: string) {
  return isAllowedPublicHttpsUrl(value);
}

async function fetchPricingPage(url: string) {
  if (!isAllowedPricingUrl(url)) throw new Error("Pricing URL is not allowed");
  const response = await fetchPublicHttpsText(url, {
    accept: "text/html,application/xhtml+xml",
    maxBytes: MAX_RESPONSE_BYTES,
    timeoutMs: FETCH_TIMEOUT_MS,
  });
  if (response.status < 200 || response.status >= 300) throw new Error(`Pricing page returned ${response.status}`);
  return response.text;
}

export type OfficialPriceSyncResult = { services: number; snapshots: number; changes: number; failedServices: string[] };

export async function syncOfficialServicePrices(serviceId?: string): Promise<OfficialPriceSyncResult> {
  const services = await prisma.serviceMaster.findMany({
    where: { status: "ACTIVE", pricingUrl: { not: null }, ...(serviceId ? { id: serviceId } : {}) },
    select: { id: true, name: true, pricingUrl: true },
  });
  let snapshots = 0;
  let changes = 0;
  const failedServices: string[] = [];
  for (const service of services) {
    if (!service.pricingUrl) continue;
    try {
      const records = parseOfficialPriceJsonLd(await fetchPricingPage(service.pricingUrl));
      for (const record of records) {
        const previous = await prisma.servicePriceSnapshot.findFirst({ where: { serviceId: service.id, planName: record.planName, currency: record.currency }, orderBy: { fetchedAt: "desc" } });
        if (previous && previous.amount === record.amount && previous.billingCycle === record.billingCycle) continue;
        await prisma.servicePriceSnapshot.create({ data: { serviceId: service.id, ...record, sourceUrl: service.pricingUrl, trustLevel: "OFFICIAL" } });
        snapshots += 1;
        if (previous && previous.amount !== record.amount) {
          await prisma.servicePriceChange.create({ data: { serviceId: service.id, planName: record.planName, oldAmount: previous.amount, newAmount: record.amount, changeAmount: record.amount - previous.amount, changePercent: previous.amount === 0 ? null : ((record.amount - previous.amount) / previous.amount) * 100, currency: record.currency, sourceUrl: service.pricingUrl, verified: true, effectiveAt: record.effectiveAt } });
          changes += 1;
        }
      }
    } catch {
      failedServices.push(service.name);
    }
  }
  return { services: services.length, snapshots, changes, failedServices };
}
