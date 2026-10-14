import { createHash } from "node:crypto";
import { isAllowedPublicHttpsUrl } from "./external-url.ts";
import { fetchPublicHttpsText } from "./public-https-fetch.ts";

const maxFeedBytes = 1_000_000;
const maxFeedItems = 30;
const maxTitleLength = 300;
const maxSummaryLength = 2_000;
const allowedContentTypes = ["application/atom+xml", "application/rss+xml", "application/xml", "text/xml"];

export type OfficialNewsFeedItem = {
  title: string;
  summaryBase: string | null;
  sourceUrl: string;
  publishedAt: Date | null;
  category: string;
  contentHash: string;
};

export class OfficialNewsFeedError extends Error {}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi, (entity) => ({
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
      "&nbsp;": " ",
    })[entity.toLowerCase()] ?? entity)
    .replace(/&#(\d+);/g, (_match, code: string) => decodeXmlCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => decodeXmlCodePoint(Number.parseInt(code, 16)));
}

function decodeXmlCodePoint(codePoint: number) {
  const isXmlCharacter = codePoint === 0x9
    || codePoint === 0xa
    || codePoint === 0xd
    || (codePoint >= 0x20 && codePoint <= 0xd7ff)
    || (codePoint >= 0xe000 && codePoint <= 0xfffd)
    || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
  return isXmlCharacter ? String.fromCodePoint(codePoint) : "\uFFFD";
}

function decodeXml(value: string) {
  let decoded = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  for (let pass = 0; pass < 2; pass += 1) {
    decoded = decodeXmlEntities(decoded).replace(/<[^>]*>/g, " ");
  }
  return decoded.replace(/\s+/g, " ").trim();
}

export function sanitizeNewsText(value: string | null | undefined) {
  return value ? decodeXml(value) : null;
}

function xmlValue(item: string, names: string[]) {
  for (const name of names) {
    const matched = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
    if (matched?.[1]) return decodeXml(matched[1]);
  }
  return "";
}

function atomLink(item: string) {
  const matched = item.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*>/i);
  return matched?.[1]?.trim() ?? "";
}

function validPublishedAt(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function bounded(value: string, maximum: number) {
  return value.slice(0, maximum);
}

function hasJapaneseText(value: string) {
  return /[\u3040-\u30ff\u3400-\u9fff]/u.test(value);
}

function extractFeedItems(xml: string) {
  const tagStart = /<\/?(item|entry)\b/gi;
  const items: string[] = [];
  let currentStart: number | null = null;
  let currentName: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = tagStart.exec(xml)) !== null) {
    const tagEnd = xml.indexOf(">", tagStart.lastIndex);
    if (tagEnd === -1) break;

    const tag = xml.slice(match.index, tagEnd + 1);
    tagStart.lastIndex = tagEnd + 1;
    if (match[0][1] !== "/") {
      if (currentStart === null && !/\/\s*>$/.test(tag)) {
        currentStart = match.index;
        currentName = match[1]?.toLowerCase() ?? null;
      }
      continue;
    }

    if (currentStart === null || match[1]?.toLowerCase() !== currentName) {
      continue;
    }

    items.push(xml.slice(currentStart, tagEnd + 1));
    currentStart = null;
    currentName = null;
    if (items.length >= maxFeedItems) break;
  }

  return items;
}

export function assertOfficialFeedUrl(value: string) {
  if (!isAllowedPublicHttpsUrl(value)) {
    throw new OfficialNewsFeedError("ニュース情報源として利用できないURLです。");
  }
  return new URL(value);
}

export function parseOfficialNewsFeed(xml: string, options?: { requireSummary?: boolean }): OfficialNewsFeedItem[] {
  const items = extractFeedItems(xml);
  const seen = new Set<string>();
  const parsed: OfficialNewsFeedItem[] = [];

  for (const item of items) {
    if (parsed.length >= maxFeedItems) break;
    const title = bounded(xmlValue(item, ["title"]), maxTitleLength);
    const rawUrl = xmlValue(item, ["link"]) || atomLink(item);
    if (!title || !rawUrl) continue;

    let sourceUrl: URL;
    try {
      sourceUrl = assertOfficialFeedUrl(rawUrl);
    } catch {
      continue;
    }

    const contentHash = createHash("sha256")
      .update(`${sourceUrl.toString()}\n${title}`)
      .digest("hex");
    if (seen.has(contentHash)) continue;
    seen.add(contentHash);
    const summary = bounded(xmlValue(item, ["description", "summary", "content"]), maxSummaryLength);
    // Avoid publishing English-only RSS items when translation quality cannot be verified.
    if (!hasJapaneseText(title) && !hasJapaneseText(summary)) continue;
    if (options?.requireSummary && summary.length < 30) continue;
    parsed.push({
      title,
      summaryBase: summary || null,
      sourceUrl: sourceUrl.toString(),
      publishedAt: validPublishedAt(xmlValue(item, ["pubDate", "published", "updated"])),
      category: bounded(xmlValue(item, ["category"]) || "更新", 50),
      contentHash,
    });
  }
  return parsed;
}

export async function fetchOfficialNewsFeed(feedUrl: string) {
  const url = assertOfficialFeedUrl(feedUrl);
  const response = await fetchPublicHttpsText(url.toString(), {
    accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    maxBytes: maxFeedBytes,
    timeoutMs: 10_000,
  });
  if (response.status < 200 || response.status >= 300) throw new OfficialNewsFeedError("公式ニュースの取得に失敗しました。");
  const contentType = response.headers["content-type"]?.toLowerCase() ?? "";
  if (!allowedContentTypes.some((type) => contentType.includes(type))) {
    throw new OfficialNewsFeedError("公式ニュースの形式がRSSまたはAtomではありません。");
  }
  return parseOfficialNewsFeed(response.text, { requireSummary: url.hostname === "news.google.com" });
}
