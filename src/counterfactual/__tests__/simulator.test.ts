import { describe, expect, it } from 'vitest';
import type { Message } from '../../../types';
import { emitActivityEvent } from '../../activity';
import type { DecisionMatrix } from '../../decision';
import { ingestKnowledgeNote, searchKnowledgeSources } from '../../knowledge';
import {
  captureCounterfactualDecisionRecord,
  resetCounterfactualStoreForTests,
} from '../store';
import {
  persistCounterfactualScenarioArtifact,
  runCounterfactualSimulationFromText,
  simulateCounterfactualScenario,
} from '../simulator';
import { parseCounterfactualQuery } from '../queryParser';

const matrix: DecisionMatrix = {
  id: 'pricing-decision-week62',
  question: 'Should we keep monthly pricing or move to annual-first at launch?',
  criteria: [
    { id: 'impact', title: 'Impact', description: 'Revenue impact', weight: 0.5 },
    { id: 'speed', title: 'Speed', description: 'Time to execute', weight: 0.2 },
    { id: 'risk', title: 'Risk', description: 'Execution downside', weight: 0.3 },
  ],
  options: [
    {
      id: 'monthly_first',
      title: 'Monthly First',
      description: 'Reduce signup friction',
      scores: { impact: 0.64, speed: 0.81, risk: 0.61 },
      assumption_ids: ['a1'],
    },
    {
      id: 'annual_first',
      title: 'Annual First',
      description: 'Increase commitment and LTV',
      scores: { impact: 0.84, speed: 0.56, risk: 0.55 },
      assumption_ids: ['a2'],
    },
  ],
  assumptions: [
    { id: 'a1', text: 'Conversion friction drives churn if commitment is high', confidence: 0.63, impact: 'high' },
    { id: 'a2', text: 'Committed users improve cash runway quickly', confidence: 0.72, impact: 'high' },
  ],
  branches: [],
  created_at_iso: '2026-05-05T09:00:00.000Z',
};

const history: Message[] = [
  {
    id: 'm1',
    role: 'user',
    text: 'I am worried about churn but want stronger cash flow.',
    timestamp: Date.parse('2026-05-05T09:00:00.000Z'),
  },
  {
    id: 'm2',
    role: 'model',
    text: 'Annual pricing improves runway but could reduce conversion speed.',
    timestamp: Date.parse('2026-05-05T09:05:00.000Z'),
  },
];

describe('counterfactual simulator', () => {
  it('simulates actual vs counterfactual timelines with confidence range', () => {
    resetCounterfactualStoreForTests();

    ingestKnowledgeNote({
      userId: 'cf-sim-user',
      title: 'Pricing Experiment Notes',
      text: 'Previous annual-first experiments increased cash collection but slowed initial conversion.',
      nowIso: '2026-05-04T08:00:00.000Z',
    });

    const record = captureCounterfactualDecisionRecord({
      userId: 'cf-sim-user',
      matrix,
      history,
      selectedOptionId: 'monthly_first',
      nowIso: '2026-05-05T09:10:00.000Z',
      threadId: 'thread-42',
    });

    emitActivityEvent({
      userId: 'cf-sim-user',
      category: 'workflow',
      eventType: 'workflow.completed',
      title: 'Pricing follow-up done',
      description: 'Updated checkout page copy.',
      createdAtIso: '2026-05-06T10:00:00.000Z',
    });

    emitActivityEvent({
      userId: 'cf-sim-user',
      category: 'decision',
      eventType: 'decision.follow_through',
      title: 'Follow-through logged',
      description: 'Partial execution on pricing plan.',
      createdAtIso: '2026-05-09T10:00:00.000Z',
    });

    const query = parseCounterfactualQuery({
      userId: 'cf-sim-user',
      rawQuery: "What if I had chosen option B in last week's pricing decision?",
      nowIso: '2026-05-14T12:00:00.000Z',
      decisionRecords: [record],
    });

    const result = simulateCounterfactualScenario({
      query,
      nowIso: '2026-05-14T12:00:00.000Z',
      decisionRecords: [record],
    });

    expect(result.actualPath.timeline).toHaveLength(3);
    expect(result.counterfactualPath.timeline).toHaveLength(3);
    expect(result.outcomeDelta.totalDownstreamEvents).toBeGreaterThan(0);
    expect(result.confidence.high).toBeGreaterThan(result.confidence.low);
    expect(result.context.knowledgeSignals.length).toBeGreaterThan(0);

    const persisted = persistCounterfactualScenarioArtifact({
      userId: 'cf-sim-user',
      scenario: result,
      nowIso: '2026-05-14T12:00:00.000Z',
    });

    expect(persisted.sourceId.length).toBeGreaterThan(0);
    const sources = searchKnowledgeSources({
      userId: 'cf-sim-user',
      term: 'scenario analysis',
    });
    expect(sources.some((source) => source.id === persisted.sourceId)).toBe(true);
  });

  it('runs full text-to-simulation flow in one call', () => {
    const result = runCounterfactualSimulationFromText({
      userId: 'cf-sim-user',
      rawQuery: "What if I had chosen option B in last week's pricing decision?",
      nowIso: '2026-05-14T12:00:00.000Z',
      preferredDecisionId: 'pricing-decision-week62',
    });

    expect(result.query.decisionId).toBe('pricing-decision-week62');
    expect(result.selectedOptionId).toBe('monthly_first');
    expect(result.alternativeOptionId).toBe('annual_first');
    expect(result.outcomeDelta.summary.length).toBeGreaterThan(20);
  });
});
