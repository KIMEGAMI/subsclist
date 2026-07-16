const ngWords = ["アダルト", "ギャンブル", "詐欺", "迷惑", "死ね", "殺す", "爆破", "反社", "違法", "個人情報"] as const;

export function normalizeText(value: string) {
  return value.normalize("NFKC").toLowerCase();
}

export function findNgWord(value: string) {
  const normalized = normalizeText(value);
  return ngWords.find((word) => normalized.includes(normalizeText(word)));
}

export function hasNgWord(value: string) {
  return Boolean(findNgWord(value));
}

export const contactNgWords = ngWords;