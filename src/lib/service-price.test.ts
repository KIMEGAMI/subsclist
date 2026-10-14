import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedPublicHttpsUrl } from "./external-url.ts";
import { fetchPublicHttpsText, isPublicAddress, resolvePublicAddresses } from "./public-https-fetch.ts";
import { parseOfficialPriceJsonLd } from "./service-price-parser.ts";
import { OFFICIAL_PRICE_MAX_RECORDS_PER_PAGE } from "./app-constants.ts";

test("official JSON-LD pricing is parsed without guessing visible text", () => {
  const html = `<h1>月額 980円</h1><script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    name: "Premium",
    offers: { price: 980, priceCurrency: "JPY", billingDuration: "P1M", description: "税込" },
  })}</script>`;
  assert.deepEqual(parseOfficialPriceJsonLd(html), [{
    planName: "Premium",
    billingCycle: "MONTHLY",
    currency: "JPY",
    amount: 980,
    taxIncluded: true,
    effectiveAt: null,
  }]);
});

test("invalid or non-structured pricing is ignored", () => {
  const html = `<p>月額 980円</p><script type="application/ld+json">not-json</script>`;
  assert.deepEqual(parseOfficialPriceJsonLd(html), []);
});

test("billing period is not guessed when official structured data omits it", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    name: "Single purchase",
    offers: { price: 980, priceCurrency: "JPY" },
  })}</script>`;

  assert.deepEqual(parseOfficialPriceJsonLd(html), []);
});

test("official pricing pages are capped to the configured number of records", () => {
  const offers = Array.from({ length: OFFICIAL_PRICE_MAX_RECORDS_PER_PAGE + 1 }, (_, index) => ({
    name: `Plan ${index}`,
    offers: { price: index + 1, priceCurrency: "JPY", billingDuration: "P1M" },
  }));
  const html = `<script type="application/ld+json">${JSON.stringify(offers)}</script>`;

  assert.equal(parseOfficialPriceJsonLd(html).length, OFFICIAL_PRICE_MAX_RECORDS_PER_PAGE);
});

test("pricing fetch accepts public HTTPS URLs and rejects local or nonstandard targets", () => {
  assert.equal(isAllowedPublicHttpsUrl("https://service.example/pricing"), true);
  for (const value of [
    "http://service.example/pricing",
    "https://localhost/pricing",
    "https://service.local/pricing",
    "https://127.0.0.1/pricing",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/pricing",
    "https://[fc00::1]/pricing",
    "https://user:pass@service.example/pricing",
    "https://service.example:8443/pricing",
  ]) {
    assert.equal(isAllowedPublicHttpsUrl(value), false, value);
  }
});

test("public address policy rejects special and internal DNS answers", async () => {
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(isPublicAddress("3001:4860:4860::8888"), true);
  for (const address of [
    "10.1.2.3", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "192.168.0.1", "198.18.0.1", "224.0.0.1",
    "::1", "::ffff:127.0.0.1", "64:ff9b::a00:1", "64:ff9b:1::1",
    "100:0:0:1::1", "fc00::1", "fe80::1", "ff02::1", "2001:2::1",
    "2001:db8::1", "3fff::1", "5f00::1",
  ]) assert.equal(isPublicAddress(address), false, address);

  await assert.rejects(resolvePublicAddresses("service.example", async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ]));

  const publicAddresses = await resolvePublicAddresses("service.example", async () => [
    { address: "8.8.4.4", family: 4 },
  ]);
  assert.equal(publicAddresses[0]?.address, "8.8.4.4");

  await assert.rejects(fetchPublicHttpsText("https://service.example/feed", {
    accept: "application/xml",
    maxBytes: 1024,
    timeoutMs: 1000,
  }, async () => [{ address: "127.0.0.1", family: 4 }]));
});
