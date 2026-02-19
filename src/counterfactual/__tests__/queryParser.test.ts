import { describe, expect, it } from 'vitest';
import type { DecisionMatrix } from '../../decision';
import { parseCounterfactualQuery } from '../queryParser';
import type { CounterfactualDecisionRecord } from '../types';

const pricingMatrix: DecisionMatrix = {
  id: 'pricing-decision',
  question: 'Should we choose monthly or annual pricing for launch?',
  criteria: [
    { id: 'impact', title: 'Impact', description: 'Revenue impact', weight: 0.5 },
    { id: 'speed', title: 'Speed', description: 'Execution speed', weight: 0.3 },
    { id: 'risk', title: 'Risk', description: 'Go-to-market risk', weight: 0.2 },
  ],
  options: [
    {
      id: 'monthly_plan',
      title: 'Monthly Plan',
      description: 'Low commitment',
      scores: { impact: 0.62, speed: 0.83, risk: 0.61 },
      assumption_ids: ['a1'],
    },
    {
      id: 'annual_plan',
      title: 'Annual Plan',
      description: 'High commitment',
      scores: { impact: 0.81, speed: 0.58, risk: 0.52 },
      assumption_ids: ['a2'],
    },
  ],
  assumptions: [
    { id: 'a1', text: 'Fast conversion matters', confidence: 0.66, impact: 'medium' },
    { id: 'a2', text: 'LTV growth outweighs friction', confidence: 0.74, impact: 'high' },
  ],
  branches: [],
  created_at_iso: '2026-05-05T10:00:00.000Z',
};

const hiringMatrix: DecisionMatrix = {
  id: 'hiring-decision',
  question: 'Should we hire backend or frontend first?',
  criteria: [
    { id: 'impact', title: 'Impact', description: 'Impact on roadmap', weight: 0.6 },
    { id: 'speed', title: 'Speed', description: 'Speed to ship', weight: 0.4 },
  ],
  options: [
    {
      id: 'backend_first',
      title: 'Backend First',
      description: 'Stabilize foundations',
      scores: { impact: 0.75, speed: 0.58 },
      assumption_ids: ['h1'],
    },
    {
      id: 'frontend_first',
      title: 'Frontend First',
      description: 'Improve UX velocity',
      scores: { impact: 0.64, speed: 0.72 },
      assumption_ids: ['h2'],
    },
  ],
  assumptions: [
    { id: 'h1', text: 'Backlog debt blocks velocity', confidence: 0.69, impact: 'high' },
    { id: 'h2', text: 'UX improvements lift retention quickly', confidence: 0.63, impact: 'medium' },
  ],
  branches: [],
  created_at_iso: '2026-04-10T09:00:00.000Z',
};

const record = (payload: {
  matrix: DecisionMatrix;
  selectedOptionId?: string;
  createdAtIso: string;
}): CounterfactualDecisionRecord => ({
  userId: 'cf-user',
  decisionId: payload.matrix.id,
  question: payload.matrix.question,
  matrix: payload.matrix,
  createdAtIso: payload.createdAtIso,
  updatedAtIso: payload.createdAtIso,
  selectedOptionId: payload.selectedOptionId,
  threadId: 'thread-1',
  tags: ['pricing', 'launch'],
  messages: [
    {
      id: 'msg-1',
      role: 'user',
      text: 'We need to decide before launch.',
      timestamp: Date.parse(payload.createdAtIso),
    },
  ],
  emotionalContext: {
    valence: 0.52,
    arousal: 0.43,
    intensity: 'medium',
    summary: 'Neutral with moderate urgency.',
  },
});

describe('counterfactual query parser', () => {
  it('parses option letter and last-week topic into a structured query with decision reference', () => {
    const query = parseCounterfactualQuery({
      userId: 'cf-user',
      rawQuery: "What if I had chosen option B in last week's pricing decision?",
      nowIso: '2026-05-14T12:00:00.000Z',
      decisionRecords: [
        record({
          matrix: pricingMatrix,
          selectedOptionId: 'monthly_plan',
          createdAtIso: '2026-05-06T09:00:00.000Z',
        }),
        record({
          matrix: hiringMatrix,
          selectedOptionId: 'backend_first',
          createdAtIso: '2026-04-10T09:00:00.000Z',
        }),
      ],
    });

    expect(query.decisionId).toBe('pricing-decision');
    expect(query.referenceOptionId).toBe('monthly_plan');
    expect(query.alternativeOptionId).toBe('annual_plan');
    expect(query.timeWindow?.label).toBe('last_week');
  });

  it('uses explicit decision id and falls back to alternative option when none is provided', () => {
    const query = parseCounterfactualQuery({
      userId: 'cf-user',
      rawQuery: 'What if I had done this differently on decision hiring-decision?',
      nowIso: '2026-05-14T12:00:00.000Z',
      decisionRecords: [
        record({
          matrix: hiringMatrix,
          selectedOptionId: 'backend_first',
          createdAtIso: '2026-04-10T09:00:00.000Z',
        }),
      ],
    });

    expect(query.decisionId).toBe('hiring-decision');
    expect(query.referenceOptionId).toBe('backend_first');
    expect(query.alternativeOptionId).toBe('frontend_first');
    expect(query.matchedBy).toBe('explicit_decision');
  });
});
