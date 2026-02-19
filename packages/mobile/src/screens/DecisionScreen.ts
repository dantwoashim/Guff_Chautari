export interface MobileDecisionOption {
  id: string;
  label: string;
  impact: number;
  speed: number;
  risk: number;
}

export interface MobileDecisionDraft {
  id: string;
  question: string;
  options: MobileDecisionOption[];
}

export interface MobileDecisionResult {
  optionId: string;
  score: number;
}

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
};

export const scoreDecisionOptions = (
  draft: MobileDecisionDraft,
  weights: { impact: number; speed: number; risk: number } = {
    impact: 0.45,
    speed: 0.3,
    risk: 0.25,
  }
): MobileDecisionResult[] => {
  return draft.options
    .map((option) => {
      const score =
        option.impact * weights.impact + option.speed * weights.speed + (1 - option.risk) * weights.risk;
      return {
        optionId: option.id,
        score: clamp01(score),
      };
    })
    .sort((left, right) => right.score - left.score);
};

export const selectRecommendedOption = (draft: MobileDecisionDraft): MobileDecisionResult | null => {
  const scores = scoreDecisionOptions(draft);
  return scores[0] ?? null;
};
