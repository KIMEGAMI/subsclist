import assert from "node:assert/strict";
import test from "node:test";
import nextConfig, { privateRouteSources, sensitiveTokenRouteSources } from "../../next.config.ts";

const authenticatedPageSources = [
  "/admin/:path*",
  "/analytics/:path*",
  "/annual-report/:path*",
  "/billing/:path*",
  "/calendar/:path*",
  "/categories/:path*",
  "/dashboard/:path*",
  "/export/:path*",
  "/monthly-report/:path*",
  "/notifications/:path*",
  "/payment-methods/:path*",
  "/payment-totals/:path*",
  "/payments/:path*",
  "/review/:path*",
  "/savings/:path*",
  "/settings/:path*",
  "/simulation/:path*",
  "/subscriptions/:path*",
] as const;

type HeaderEntry = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

test("個人データを表示する全ページを検索対象外にする", async () => {
  for (const source of authenticatedPageSources) {
    assert.equal(privateRouteSources.includes(source), true, `${source} が非公開ルート一覧にありません`);
  }

  const configHeaders = nextConfig.headers;
  assert.ok(configHeaders);
  const entries = await configHeaders() as HeaderEntry[];
  assert.ok(entries);
  for (const source of authenticatedPageSources) {
    const entry: HeaderEntry | undefined = entries.find((candidate: HeaderEntry) => candidate.source === source);
    assert.equal(
      entry?.headers.some((header: { key: string; value: string }) => header.key === "X-Robots-Tag" && header.value.includes("noindex")),
      true,
      `${source} にX-Robots-Tagがありません`,
    );
  }

  const apiEntry = entries.find((candidate: HeaderEntry) => candidate.source === "/api/:path*");
  assert.equal(
    apiEntry?.headers.some((header: { key: string; value: string }) => header.key === "Cache-Control" && header.value === "private, no-store"),
    true,
    "個人情報を返すAPIにCache-Control: private, no-storeがありません",
  );
});

test("ワンタイムトークンを含むURLと認証APIをキャッシュ・Refererから保護する", async () => {
  const configHeaders = nextConfig.headers;
  assert.ok(configHeaders);
  const entries = await configHeaders() as HeaderEntry[];

  for (const source of sensitiveTokenRouteSources) {
    const matchingHeaders = entries
      .filter((candidate) => candidate.source === source)
      .flatMap((candidate) => candidate.headers);
    assert.equal(
      matchingHeaders.some((header) => header.key === "Cache-Control" && header.value === "private, no-store"),
      true,
      `${source} に no-store がありません`,
    );
    assert.equal(
      matchingHeaders.some((header) => header.key === "Referrer-Policy" && header.value === "no-referrer"),
      true,
      `${source} に no-referrer がありません`,
    );
  }
});
