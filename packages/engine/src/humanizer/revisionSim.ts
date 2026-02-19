import type { RevisionEvent } from '../pipeline/types';
import type { RevisionInput } from './types';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

export const simulateRevisionEvent = (input: RevisionInput): RevisionEvent => {
  const complexity = clamp(input.emotionalComplexity, 0, 1);
  const longText = input.text.length > 80;

  if (complexity >= 0.6 && (input.containsQuestion || longText)) {
    return {
      shouldRevise: true,
      pauseMs: Math.round(500 + complexity * 900),
      reason: 'Emotionally complex turn triggered self-revision behavior.',
    };
  }

  return {
    shouldRevise: false,
    pauseMs: 0,
    reason: 'No revision required for this turn.',
  };
};
