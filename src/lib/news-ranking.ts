export type NewsRankingInput = {
  category: string;
  importance: number;
  publishedAt: Date | null;
  contracted: boolean;
  now?: Date;
};

const categoryScores: Record<string, number> = {
  PRICE_CHANGE: 70,
  SERVICE_END: 70,
  PLAN_CHANGE: 60,
  FREE_PLAN_CHANGE: 55,
  SECURITY: 50,
  MAJOR_UPDATE: 40,
};

export function rankNews(input: NewsRankingInput) {
  const now = input.now ?? new Date();
  const ageHours = input.publishedAt ? Math.max(0, now.getTime() - input.publishedAt.getTime()) / 3_600_000 : Number.POSITIVE_INFINITY;
  return (input.contracted ? 100 : 0)
    + (categoryScores[input.category] ?? 0)
    + Math.max(0, Math.min(20, input.importance))
    + (ageHours <= 24 ? 20 : ageHours > 24 * 7 ? -30 : 0);
}
