import assert from "node:assert/strict";
import test from "node:test";
import { assertOfficialFeedUrl, parseOfficialNewsFeed } from "./news-feed.ts";

test("RSSの公式ニュースを安全なテキストとして取り込む", () => {
  const items = parseOfficialNewsFeed(`<?xml version="1.0"?><rss><channel><item><title><![CDATA[価格改定のお知らせ]]></title><link>https://github.blog/changelog/example/</link><description><![CDATA[<p>更新の概要です。</p>]]></description><pubDate>Fri, 12 Sep 2026 00:00:00 GMT</pubDate><category>Release</category></item></channel></rss>`);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, "価格改定のお知らせ");
  assert.equal(items[0]?.summaryBase, "更新の概要です。");
  assert.equal(items[0]?.category, "Release");
  assert.equal(items[0]?.sourceUrl, "https://github.blog/changelog/example/");
});

test("ローカル・IPアドレス・非HTTPS・認証情報付き情報源を拒否する", () => {
  for (const value of [
    "http://example.com/feed.xml",
    "https://localhost/feed.xml",
    "https://127.0.0.1/feed.xml",
    "https://169.254.169.254/feed.xml",
    "https://[::1]/feed.xml",
    "https://[fc00::1]/feed.xml",
    "https://user:pass@example.com/feed.xml",
    "https://example.com:8443/feed.xml",
  ]) {
    assert.throws(() => assertOfficialFeedUrl(value));
  }
});

test("英語だけのRSS記事は誤訳のまま掲載せず除外する", () => {
  const items = parseOfficialNewsFeed(`<?xml version="1.0"?><rss><channel><item><title>Pricing update</title><link>https://example.com/pricing.xml</link><description>Prices will change next month.</description></item><item><title>日本語のお知らせ</title><link>https://example.com/jp.xml</link><description>提供内容を更新しました。</description></item></channel></rss>`);
  assert.deepEqual(items.map((item) => item.title), ["日本語のお知らせ"]);
});

test("不正な数値文字参照は置換し後続記事の解析を続ける", () => {
  const items = parseOfficialNewsFeed(`<rss><channel><item><title>料金のお知らせ</title><link>https://example.com/broken</link><description>適用日は&#x110000;です。</description></item><item><title>次のお知らせ</title><link>https://example.com/next</link><description>提供内容を更新しました。</description></item></channel></rss>`);

  assert.deepEqual(items.map((item) => item.title), ["料金のお知らせ", "次のお知らせ"]);
  assert.equal(items[0]?.summaryBase, "適用日は\uFFFDです。");
});

test("HTMLエスケープされたGoogleニュース概要をプレーンテキストにする", () => {
  const items = parseOfficialNewsFeed(`<?xml version="1.0"?><rss><channel><item><title>Gemini Sparkとは？料金や使い方</title><link>https://news.google.com/rss/articles/example</link><description>&lt;a href="https://example.com" target="_blank"&gt;Gemini Sparkとは？料金や使い方、何ができるかをわかりやすく解説&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;SHIFT AI&lt;/font&gt;\u3000サービスの特徴や利用方法を紹介します。</description></item></channel></rss>`);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.summaryBase?.includes("<a"), false);
  assert.equal(items[0]?.summaryBase?.includes("SHIFT AI"), true);
});

test("日本語Googleニュースの概要が短すぎる記事を除外する", () => {
  const items = parseOfficialNewsFeed(`<?xml version="1.0"?><rss><channel><item><title>短いニュース</title><link>https://news.google.com/rss/articles/short</link><description>短い概要</description></item><item><title>十分なニュース概要</title><link>https://news.google.com/rss/articles/long</link><description>料金改定の背景と対象プラン、適用開始日、利用者が確認すべき手続きについて詳しく説明しています。</description></item></channel></rss>`, { requireSummary: true });
  assert.deepEqual(items.map((item) => item.title), ["十分なニュース概要"]);
});

test("壊れた入れ子タグを含むフィードを上限付きで走査する", () => {
  const malformed = "<item>".repeat(10_000);
  const items = parseOfficialNewsFeed(`<rss><channel>${malformed}</channel></rss>`);
  assert.equal(items.length, 0);
});

test("フィード記事の抽出を最大30件に制限する", () => {
  const entries = Array.from({ length: 40 }, (_, index) =>
    `<item><title>記事 ${index} お知らせ</title><link>https://example.com/${index}</link></item>`,
  ).join("");
  assert.equal(parseOfficialNewsFeed(`<rss><channel>${entries}</channel></rss>`).length, 30);
});
