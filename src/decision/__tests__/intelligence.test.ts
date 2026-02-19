import { describe, expect, it } from 'vitest';
import type { Message } from '../../../types';
import { ingestKnowledgeNote } from '../../knowledge';
import {
  buildConversationReferences,
  buildCounterfactual,
  buildDecisionIntelligenceEvidence,
  simulateFutureOutcomes,
  summarizeFollowThrough,
} from '../intelligence';
import type { DecisionMatrix, DecisionTelemetryEvent } from '../types';

const matrix: DecisionMatrix = {
  id: 'decision-intel-1',
  question: 'Should we launch a focused weekly workflow?',
  criteria: [
    { id: 'impact', title: 'Impact', description: 'Outcome leverage', weight: 0.5 },
    { id: 'speed', title: 'Speed', description: 'Execution speed', weight: 0.3 },
    { id: 'risk', title: 'Risk', description: 'Downside control', weight: 0.2 },
  ],
  options: [
    {
      id: 'focused',
      title: 'Focused rollout',
      description: 'Ship one loop first',
      scores: { impact: 0.85, speed: 0.8, risk: 0.7 },
      assumption_ids: ['a1', 'a2'],
    },
    {
      id: 'broad',
      title: 'Broad rollout',
      description: 'Ship all features now',
      scores: { impact: 0.72, speed: 0.5, risk: 0.45 },
      assumption_ids: ['a1'],
    },
  ],
  assumptions: [
    { id: 'a1', text: 'Demand exists for weekly workflow', confidence: 0.8, impact: 'high' },
    { id: 'a2', text: 'Focused loop compounds retention', confidence: 0.7, impact: 'medium' },
  ],
  branches: [],
  created_at_iso: '2026-10-12T10:00:00.000Z',
};

const history: Message[] = [
  {
    id: 'm1',
    role: 'user',
    text: 'I want a focused launch with clear weekly execution.',
    timestamp: Date.UTC(2026, 9, 12, 8, 0, 0),
  },
  {
    id: 'm2',
    role: 'model',
    text: 'A broad launch may dilute speed and increase risk.',
    timestamp: Date.UTC(2026, 9, 12, 8, 10, 0),
  },
];

describe('decision intelligence', () => {
  it('builds conversation references and future simulation outputs', () => {
    const references = buildConversationReferences({
      history,
      question: matrix.question,
      limit: 4,
    });

    expect(references.length).toBeGreaterThan(0);
    expect(references[0].relevance).toBeGreaterThan(0);

    const outcomes = simulateFutureOutcomes({ matrix, horizonMonths: 3 });
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0].points).toHaveLength(3);

    const counterfactual = buildCounterfactual({
      matrix,
      selectedOptionId: 'focused',
      alternativeOptionId: 'broad',
      horizonMonths: 3,
    });

    expect(counterfactual.summary.length).toBeGreaterThan(20);
  });

  it('merges knowledge retrieval evidence with decision evidence', () => {
    ingestKnowledgeNote({
      userId: 'decision-user',
      title: 'Launch Note',
      text: 'Focused weekly loops improved retention in prior experiments.',
      nowIso: '2026-10-10T09:00:00.000Z',
    });

    const result = buildDecisionIntelligenceEvidence({
      userId: 'decision-user',
      question: matrix.question,
      baseEvidence: {
        memories: [],
        history,
        now_iso: '2026-10-13T12:00:00.000Z',
        limit: 8,
      },
    });

    expect(result.evidence.some((entry) => entry.type === 'knowledge')).toBe(true);
    expect(result.synthesis.answer.length).toBeGreaterThan(20);
  });

  it('summarizes follow-through outcomes from telemetry events', () => {
    const events: DecisionTelemetryEvent[] = [
      {
        id: 'e1',
        type: 'decision_created',
        decision_id: 'd1',
        created_at_iso: '2026-10-12T08:00:00.000Z',
        metadata: {},
      },
      {
        id: 'e2',
        type: 'decision_completed',
        decision_id: 'd1',
        created_at_iso: '2026-10-12T08:10:00.000Z',
        metadata: {},
      },
      {
        id: 'e3',
        type: 'decision_follow_through',
        decision_id: 'd1',
        created_at_iso: '2026-10-12T09:00:00.000Z',
        metadata: { outcome: 'success', score: 0.9 },
      },
    ];

    const summary = summarizeFollowThrough(events);
    expect(summary.completed).toBe(1);
    expect(summary.follow_through_success).toBe(1);
    expect(summary.success_rate).toBe(1);
  });
});
