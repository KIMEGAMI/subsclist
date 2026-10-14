export type NewsDigestInput = {
  title: string;
  summary: string | null;
  serviceName: string;
  category: string;
  publishedLabel: string;
  sourceName: string;
};

export function buildNewsDigest(input: NewsDigestInput) {
  const summary = input.summary?.trim() || "RSSに概要がないため、参照元の本文を確認してください。";
  return [
    `見出し: ${input.title}`,
    `概要: ${summary}`,
    `対象サービス: ${input.serviceName}`,
    `ニュース分類: ${input.category}`,
    `掲載日: ${input.publishedLabel}`,
    "契約者が確認する点: 料金、プラン、提供条件に変更がないか確認してください。",
    "利用者への影響: 現在の契約プラン、更新日、利用中の機能と照らし合わせてください。",
    "判断の目安: 変更が自分の利用状況に関係する場合は、契約変更や乗り換えを検討してください。",
    `情報源: ${input.sourceName}`,
    "注意: この要約だけで契約変更を決めず、最後に原文を確認してください。",
  ];
}
