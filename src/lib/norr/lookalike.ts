export type LookalikeSeed = {
  id: string;
  name: string;
  industry_code?: string | null;
  municipality?: string | null;
  revenue?: number | null;
  website_score?: number | null;
  employee_count?: number | null;
  country?: string | null;
};

export type LookalikeScore = {
  id: string;
  score: number;
  reasons: string[];
};

export function lookalikeScore(seed: LookalikeSeed, other: LookalikeSeed): LookalikeScore | null {
  if (other.id === seed.id) return null;
  const reasons: string[] = [];
  let score = 0;
  const ind = (seed.industry_code ?? "").slice(0, 2);
  const oind = (other.industry_code ?? "").slice(0, 2);
  if (ind && oind && ind === oind) {
    score += 40;
    reasons.push("same industry");
    if ((seed.industry_code ?? "") === (other.industry_code ?? "") && (seed.industry_code ?? "").length >= 3) {
      score += 15;
      reasons.push("same industry code");
    }
  } else if (ind && oind) {
    return null;
  }
  const mun = (seed.municipality ?? "").toLowerCase();
  const omun = (other.municipality ?? "").toLowerCase();
  if (mun && omun && mun === omun) {
    score += 18;
    reasons.push("same city");
  }
  if (seed.country && other.country && seed.country === other.country) score += 6;
  if (seed.revenue != null && other.revenue != null && seed.revenue > 0 && other.revenue > 0) {
    const ratio = Math.min(seed.revenue, other.revenue) / Math.max(seed.revenue, other.revenue);
    if (ratio >= 0.4) {
      score += Math.round(ratio * 16);
      reasons.push("similar published revenue");
    }
  }
  if (seed.website_score != null && other.website_score != null) {
    const d = Math.abs(seed.website_score - other.website_score);
    if (d <= 15) {
      score += 10;
      reasons.push("similar website quality");
    }
  }
  if (seed.employee_count != null && other.employee_count != null && seed.employee_count > 0) {
    const ratio = Math.min(seed.employee_count, other.employee_count) / Math.max(seed.employee_count, other.employee_count);
    if (ratio >= 0.4) score += 8;
  }
  if (score < 40) return null;
  return { id: other.id, score: Math.min(100, score), reasons };
}

export function rankLookalikes(seed: LookalikeSeed, pool: LookalikeSeed[], limit = 25): LookalikeScore[] {
  return pool
    .map((o) => lookalikeScore(seed, o))
    .filter((x): x is LookalikeScore => Boolean(x))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
