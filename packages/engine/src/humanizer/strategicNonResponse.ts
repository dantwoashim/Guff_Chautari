import type { StrategicNonResponsePlan } from '../pipeline/types';
import type { StrategicNonResponseInput } from './types';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const baseByStage: Record<StrategicNonResponseInput['relationshipStage'], number> = {
  stranger: 0.18,
  acquaintance: 0.2,
  friend: 0.24,
  close: 0.28,
  intimate: 0.32,
};

export const planStrategicNonResponse = (
  input: StrategicNonResponseInput
): StrategicNonResponsePlan => {
  const complexity = clamp(input.emotionalComplexity, 0, 1);
  const latenessBoost = input.period === 'late_night' ? 0.12 : 0;
  const tensionBoost = input.unresolvedTension ? 0.18 : 0;

  const probability = baseByStage[input.relationshipStage] + complexity * 0.35 + latenessBoost + tensionBoost;

  if (probability < 0.65) {
    return {
      shouldDelay: false,
      delayMs: 0,
      reason: 'No strategic silence needed.',
    };
  }

  const delayMs = Math.round(clamp(10 * 60 * 1000 + complexity * 35 * 60 * 1000, 10 * 60 * 1000, 45 * 60 * 1000));

  return {
    shouldDelay: true,
    delayMs,
    reason: 'Strategic delayed response triggered by emotional complexity and relationship dynamics.',
  };
};
