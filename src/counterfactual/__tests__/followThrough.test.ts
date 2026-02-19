import { describe, expect, it } from 'vitest';
import type { Message } from '../../../types';
import type { DecisionMatrix } from '../../decision';
import { captureCounterfactualDecisionRecord, resetCounterfactualStoreForTests } from '../store';
import {
  listFollowThroughNudges,
  runFollowThroughTracker,
  summarizeFollowThroughDashboard,
  resetFollowThroughStoreForTests,
} from '../followThrough';

const matrix: DecisionMatrix = {
  id: 'week63-followthrough-decision',
  question: 'Should we ship the launch page this week?',
  criteria: [
    { id: 'impact', title: 'Impact', description: 'Outcome leverage', weight: 0.6 },
    { id: 'speed', title: 'Speed', description: 'Execution speed', weight: 0.4 },
  ],
  options: [
    {
      id: 'ship_now',
      title: 'Ship now',
      description: 'Launch this week',
      scores: { impact: 0.82, speed: 0.74 },
      assumption_ids: ['a1'],
    },
    {
      id: 'delay',
      title: 'Delay one week',
      description: 'Prepare more',
      scores: { impact: 0.66, speed: 0.52 },
      assumption_ids: ['a2'],
    },
  ],
  assumptions: [
    { id: 'a1', text: 'Current prep is sufficient', confidence: 0.64, impact: 'high' },
    { id: 'a2', text: 'Extra prep improves conversion', confidence: 0.62, impact: 'medium' },
  ],
  branches: [],
  created_at_iso: '2026-06-08T09:00:00.000Z',
};

const history: Message[] = [
  {
    id: 'ft-1',
    role: 'user',
    text: 'Let us ship this week and track follow-through tightly.',
    timestamp: Date.parse('2026-06-08T09:00:00.000Z'),
  },
];

describe('follow-through tracker', () => {
  it('generates a nudge when a Monday decision has no follow-through by Wednesday', () => {
    resetCounterfactualStoreForTests();
    resetFollowThroughStoreForTests();

    captureCounterfactualDecisionRecord({
      userId: 'week63-follow-user',
      matrix,
      history,
      selectedOptionId: 'ship_now',
      nowIso: '2026-06-08T09:00:00.000Z', // Monday
    });

    const tracker = runFollowThroughTracker({
      userId: 'week63-follow-user',
      nowIso: '2026-06-10T09:00:00.000Z', // Wednesday
      expectedWindowHours: 48,
    });

    expect(tracker.statuses).toHaveLength(1);
    expect(tracker.statuses[0]?.status).not.toBe('on_track');
    expect(tracker.createdNudges.length).toBeGreaterThan(0);

    const nudges = listFollowThroughNudges({
      userId: 'week63-follow-user',
    });
    expect(nudges.length).toBeGreaterThan(0);

    const dashboard = summarizeFollowThroughDashboard({
      userId: 'week63-follow-user',
      nowIso: '2026-06-10T09:00:00.000Z',
      expectedWindowHours: 48,
    });
    expect(dashboard.atRisk + dashboard.missed).toBeGreaterThan(0);
  });
});
