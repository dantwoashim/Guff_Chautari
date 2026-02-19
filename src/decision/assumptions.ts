import type {
  DecisionAssumption,
  DecisionMatrix,
  DecisionRecommendation,
} from './types';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

export const normalizeAssumptions = (
  assumptions: ReadonlyArray<DecisionAssumption>
): DecisionAssumption[] => {
  return assumptions.map((assumption) => ({
    ...assumption,
    confidence: clamp(assumption.confidence, 0, 1),
  }));
};

export const validateAssumptions = (
  assumptions: ReadonlyArray<DecisionAssumption>
): { ok: boolean; errors: string[] } => {
  const errors: string[] = [];

  assumptions.forEach((assumption) => {
    if (!assumption.id) {
      errors.push('assumption id is required');
    }

    if (!assumption.text || assumption.text.trim().length === 0) {
      errors.push(`assumption ${assumption.id} text is required`);
    }

    if (assumption.confidence < 0 || assumption.confidence > 1) {
      errors.push(`assumption ${assumption.id} confidence must be between 0 and 1`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
  };
};

export const confidenceWeightedImpact = (
  assumptions: ReadonlyArray<DecisionAssumption>
): number => {
  if (assumptions.length === 0) return 0;

  const impactWeight = (impact: DecisionAssumption['impact']): number => {
    switch (impact) {
      case 'high':
        return 1;
      case 'medium':
        return 0.7;
      default:
        return 0.4;
    }
  };

  const total = assumptions.reduce(
    (sum, assumption) => sum + clamp(assumption.confidence, 0, 1) * impactWeight(assumption.impact),
    0
  );

  return total / assumptions.length;
};

export const ensureRecommendationAssumptions = (
  matrix: DecisionMatrix,
  recommendation: DecisionRecommendation
): DecisionRecommendation => {
  if (recommendation.assumption_refs.length > 0) {
    return recommendation;
  }

  const fallback = matrix.assumptions
    .slice()
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 2)
    .map((assumption) => assumption.id);

  return {
    ...recommendation,
    assumption_refs: fallback,
  };
};
