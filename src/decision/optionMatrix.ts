import type {
  DecisionMatrix,
  DecisionRecommendation,
  DecisionCriterion,
  OptionCriterionBreakdown,
  OptionRanking,
} from './types';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

export const normalizeCriteriaWeights = (
  criteria: ReadonlyArray<DecisionCriterion>
): DecisionCriterion[] => {
  if (criteria.length === 0) return [];

  const positiveWeights = criteria.map((criterion) => Math.max(0, criterion.weight));
  const total = positiveWeights.reduce((sum, value) => sum + value, 0);

  if (total === 0) {
    const uniform = 1 / criteria.length;
    return criteria.map((criterion) => ({ ...criterion, weight: uniform }));
  }

  return criteria.map((criterion, index) => ({
    ...criterion,
    weight: positiveWeights[index] / total,
  }));
};

const buildBreakdown = (
  criteria: ReadonlyArray<DecisionCriterion>,
  optionScores: Record<string, number>
): OptionCriterionBreakdown[] => {
  return criteria.map((criterion) => {
    const raw = clamp(optionScores[criterion.id] ?? 0, 0, 1);
    return {
      criterion_id: criterion.id,
      criterion_title: criterion.title,
      normalized_weight: criterion.weight,
      raw_score: raw,
      weighted_score: raw * criterion.weight,
    };
  });
};

export const rankDecisionOptions = (matrix: DecisionMatrix): OptionRanking[] => {
  const normalizedCriteria = normalizeCriteriaWeights(matrix.criteria);

  const rankings = matrix.options.map((option) => {
    const breakdown = buildBreakdown(normalizedCriteria, option.scores);
    const score = breakdown.reduce((sum, row) => sum + row.weighted_score, 0);

    return {
      option_id: option.id,
      option_title: option.title,
      score,
      criterion_breakdown: breakdown,
      assumption_refs: option.assumption_ids ? [...option.assumption_ids] : [],
    } satisfies OptionRanking;
  });

  return rankings.slice().sort((left, right) => right.score - left.score);
};

export const buildDecisionRecommendation = (
  matrix: DecisionMatrix
): DecisionRecommendation | null => {
  const rankings = rankDecisionOptions(matrix);
  const top = rankings[0];

  if (!top) {
    return null;
  }

  let assumptionRefs = [...top.assumption_refs];
  if (assumptionRefs.length === 0) {
    const fallback = matrix.assumptions
      .slice()
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, 2)
      .map((assumption) => assumption.id);
    assumptionRefs = fallback;
  }

  const strongestCriterion = top.criterion_breakdown
    .slice()
    .sort((left, right) => right.weighted_score - left.weighted_score)[0];

  const rationale = strongestCriterion
    ? `Top option on weighted matrix; strongest driver is ${strongestCriterion.criterion_title}.`
    : 'Top option on weighted matrix.';

  return {
    matrix_id: matrix.id,
    recommended_option_id: top.option_id,
    score: top.score,
    rationale,
    assumption_refs: assumptionRefs,
  };
};
