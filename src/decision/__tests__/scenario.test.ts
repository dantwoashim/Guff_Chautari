import { describe, expect, it } from 'vitest';
import { addScenarioBranch, compareScenarios } from '../scenario';
import type { DecisionMatrix } from '../types';

const baseMatrix: DecisionMatrix = {
  id: 'decision-2',
  question: 'Where should we distribute first?',
  criteria: [
    { id: 'reach', title: 'Reach', description: 'Audience reach', weight: 0.5 },
    { id: 'fit', title: 'Fit', description: 'Audience fit', weight: 0.5 },
  ],
  options: [
    {
      id: 'x',
      title: 'Channel X',
      description: 'Fast top funnel',
      scores: { reach: 0.9, fit: 0.5 },
      assumption_ids: ['a1'],
    },
    {
      id: 'community',
      title: 'Community',
      description: 'Lower volume but stronger conversion',
      scores: { reach: 0.6, fit: 0.9 },
      assumption_ids: ['a2'],
    },
  ],
  assumptions: [
    { id: 'a1', text: 'Reach converts', confidence: 0.5, impact: 'medium' },
    { id: 'a2', text: 'Community trust compounds', confidence: 0.8, impact: 'high' },
  ],
  branches: [],
  created_at_iso: '2026-06-08T12:00:00.000Z',
};

describe('scenario branching', () => {
  it('forks scenario with overrides and compares branch outcomes side-by-side', () => {
    const withBranch = addScenarioBranch(baseMatrix, {
      label: 'Reach drops, fit matters more',
      parent_id: null,
      criterion_weight_overrides: { reach: 0.2, fit: 0.8 },
      option_score_overrides: {
        x: { fit: 0.35 },
      },
    });

    const comparison = compareScenarios(withBranch);

    expect(comparison.length).toBe(2);
    expect(comparison[0].branch_id).toBe('base');
    expect(comparison[1].branch_label).toContain('Reach drops');
    expect(comparison[0].top_option_id).not.toBeNull();
    expect(comparison[1].top_option_id).not.toBeNull();
  });
});
