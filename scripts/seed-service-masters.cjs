/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const mariadb = require("mariadb");

const services = [
  ["chatgpt", "ChatGPT", "AI", "https://chatgpt.com/", "https://openai.com/chatgpt/pricing/", "https://openai.com/news/"],
  ["claude", "Claude", "AI", "https://claude.ai/", "https://www.anthropic.com/pricing", "https://www.anthropic.com/news"],
  ["gemini", "Gemini", "AI", "https://gemini.google.com/", "https://gemini.google/subscriptions/", "https://blog.google/technology/ai/"],
  ["github-copilot", "GitHub Copilot", "開発", "https://github.com/features/copilot", "https://github.com/features/copilot/plans", "https://github.blog/changelog/feed/"],
  ["notion", "Notion", "仕事効率化", "https://www.notion.so/", "https://www.notion.com/pricing", "https://www.notion.so/releases"],
  ["figma", "Figma", "デザイン", "https://www.figma.com/", "https://www.figma.com/pricing/", "https://www.figma.com/release-notes/"],
  ["canva", "Canva", "デザイン", "https://www.canva.com/", "https://www.canva.com/pricing/", "https://www.canva.com/newsroom/"],
  ["adobe", "Adobe Creative Cloud", "デザイン", "https://www.adobe.com/", "https://www.adobe.com/creativecloud/plans.html", "https://blog.adobe.com/"],
  ["microsoft-365", "Microsoft 365", "仕事効率化", "https://www.microsoft.com/microsoft-365", "https://www.microsoft.com/microsoft-365/buy/compare-all-microsoft-365-products", "https://www.microsoft.com/microsoft-365/blog/"],
  ["dropbox", "Dropbox", "クラウド", "https://www.dropbox.com/", "https://www.dropbox.com/plans", "https://blog.dropbox.com/"],
  ["zoom", "Zoom", "仕事効率化", "https://www.zoom.com/", "https://www.zoom.com/pricing", "https://news.zoom.com/"],
  ["spotify", "Spotify", "エンターテインメント", "https://www.spotify.com/", "https://www.spotify.com/premium/", "https://newsroom.spotify.com/"],
];

function envValue(name) {
  if (process.env[name]) return process.env[name];
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return "";
  const line = fs.readFileSync(envPath, "utf8").split(/\r?\n/).find((value) => value.trim().startsWith(`${name}=`));
  return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "") : "";
}

async function main() {
  const url = new URL(envValue("DATABASE_URL"));
  const connection = await mariadb.createConnection({ host: url.hostname, port: Number(url.port || "3306"), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.slice(1), charset: "utf8mb4" });
  try {
    for (const [slug, name, category, officialUrl, pricingUrl, newsUrl] of services) {
      await connection.query("INSERT INTO ServiceMaster (id, slug, name, category, officialUrl, pricingUrl, newsUrl, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NOW(3), NOW(3)) ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category), officialUrl = VALUES(officialUrl), pricingUrl = VALUES(pricingUrl), newsUrl = VALUES(newsUrl), status = 'ACTIVE', updatedAt = NOW(3)", [`service_${slug}`, slug, name, category, officialUrl, pricingUrl, newsUrl]);
    }
    console.log(`${services.length}件のService Masterを登録しました。`);
  } finally { await connection.end(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Service Masterの登録に失敗しました。"); process.exit(1); });
