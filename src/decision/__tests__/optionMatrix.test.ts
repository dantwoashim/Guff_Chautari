import { describe, expect, it } from 'vitest';
import { buildDecisionRecommendation, rankDecisionOptions } from '../optionMatrix';
import type { DecisionMatrix } from '../types';

const matrix: DecisionMatrix = {
  id: 'decision-1',
  question: 'Which launch plan should I run?',
  criteria: [
    { id: 'speed', title: 'Speed', description: 'Time to execution', weight: 0.4 },
    { id: 'risk', title: 'Risk', description: 'Downside exposure', weight: 0.35 },
    { id: 'leverage', title: 'Leverage', description: 'Compounding impact', weight: 0.25 },
  ],
  options: [
    {
      id: 'opt-a',
      title: 'Broad launch',
      description: 'Ship many features at once',
      scores: { speed: 0.5, risk: 0.3, leverage: 0.6 },
      assumption_ids: ['a1'],
    },
    {
      id: 'opt-b',
      title: 'Narrow launch',
      description: 'Ship one high-leverage loop',
      scores: { speed: 0.8, risk: 0.7, leverage: 0.85 },
      assumption_ids: ['a1', 'a2'],
    },
  ],
  assumptions: [
    { id: 'a1', text: 'User demand exists', confidence: 0.8, impact: 'high' },
    { id: 'a2', text: 'Team can execute in 2 weeks', confidence: 0.72, impact: 'medium' },
  ],
  branches: [],
  created_at_iso: '2026-06-08T10:00:00.000Z',
};

describe('decision option matrix', () => {
  it('ranks options and builds assumption-referenced recommendation', () => {
    const rankings = rankDecisionOptions(matrix);
    expect(rankings[0].option_id).toBe('opt-b');
    expect(rankings[0].score).toBeGreaterThan(rankings[1].score);

    const recommendation = buildDecisionRecommendation(matrix);
    expect(recommendation).not.toBeNull();
    if (!recommendation) return;

    expect(recommendation.recommended_option_id).toBe('opt-b');
    expect(recommendation.assumption_refs.length).toBeGreaterThan(0);
    expect(recommendation.rationale.length).toBeGreaterThan(10);
  });
});
