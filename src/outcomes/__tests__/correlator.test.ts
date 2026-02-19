import { beforeEach, describe, expect, it } from 'vitest';
import type { ActivityEvent } from '../../activity';
import { createOutcomeGoal, recordOutcomeCheckIn, resetOutcomeStoreForTests } from '../tracker';
import { generateOutcomeCorrelationReport } from '../correlator';

beforeEach(() => {
  resetOutcomeStoreForTests();
});

describe('outcome correlator', () => {
  it('identifies top contributing factors from activity + progress signals', () => {
    const goal = createOutcomeGoal(
      {
        userId: 'user-correlation',
        title: 'Increase weekly product velocity',
        description: 'Ship more high-quality iterations.',
        metrics: [
          {
            id: 'metric-velocity',
            label: 'Velocity points',
            type: 'numeric',
            direction: 'increase',
            targetValue: 10,
          },
        ],
        milestones: [],
        nowIso: '2026-07-01T09:00:00.000Z',
      },
      { emitActivity: false }
    );

    recordOutcomeCheckIn(
      {
        userId: goal.userId,
        goalId: goal.id,
        atIso: '2026-07-02T08:00:00.000Z',
        metricValues: { 'metric-velocity': 1 },
      },
      { emitActivity: false }
    );
    recordOutcomeCheckIn(
      {
        userId: goal.userId,
        goalId: goal.id,
        atIso: '2026-07-03T08:00:00.000Z',
        metricValues: { 'metric-velocity': 3 },
      },
      { emitActivity: false }
    );
    recordOutcomeCheckIn(
      {
        userId: goal.userId,
        goalId: goal.id,
        atIso: '2026-07-04T08:00:00.000Z',
        metricValues: { 'metric-velocity': 6 },
      },
      { emitActivity: false }
    );

    const activityEvents: ActivityEvent[] = [
      {
        id: 'a1',
        userId: goal.userId,
        category: 'workflow',
        eventType: 'workflow.completed',
        title: 'Deep work block completed',
        description: 'Finished focused execution session.',
        createdAtIso: '2026-07-02T10:00:00.000Z',
      },
      {
        id: 'a2',
        userId: goal.userId,
        category: 'workflow',
        eventType: 'workflow.completed',
        title: 'Deep work block completed',
        description: 'Another focused execution session.',
        createdAtIso: '2026-07-03T10:00:00.000Z',
      },
      {
        id: 'a3',
        userId: goal.userId,
        category: 'workflow',
        eventType: 'workflow.completed',
        title: 'Deep work block completed',
        description: 'Third focused execution session.',
        createdAtIso: '2026-07-04T10:00:00.000Z',
      },
      {
        id: 'a4',
        userId: goal.userId,
        category: 'decision',
        eventType: 'decision.completed',
        title: 'Decision finalized',
        description: 'One decision event for baseline comparison.',
        createdAtIso: '2026-07-03T14:00:00.000Z',
      },
    ];

    const report = generateOutcomeCorrelationReport({
      userId: goal.userId,
      goalId: goal.id,
      nowIso: '2026-07-05T10:00:00.000Z',
      activityEvents,
      windowDays: 30,
    });

    expect(report.factors.length).toBeGreaterThan(0);
    expect(report.factors[0].label).toBe('Deep work blocks');
    expect(report.factors[0].correlation).toBeGreaterThan(0);
  });
});
