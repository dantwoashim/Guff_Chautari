import { beforeEach, describe, expect, it } from 'vitest';
import {
  assessOutcomeGoal,
  createOutcomeGoal,
  getOutcomeGoal,
  recordOutcomeCheckIn,
  resetOutcomeStoreForTests,
} from '../tracker';

beforeEach(() => {
  resetOutcomeStoreForTests();
});

describe('outcome tracker', () => {
  it('tracks milestone progress and computes assessment for a 3-milestone outcome', () => {
    const goal = createOutcomeGoal(
      {
        userId: 'user-outcome',
        title: 'Improve launch execution quality',
        description: 'Ship faster with stronger retention quality.',
        checkInFrequency: 'weekly',
        metrics: [
          {
            id: 'metric-tasks',
            label: 'Tasks completed',
            type: 'numeric',
            direction: 'increase',
            targetValue: 10,
            currentValue: 0,
          },
          {
            id: 'metric-retention',
            label: 'Retention',
            type: 'percentage',
            direction: 'increase',
            targetValue: 40,
            currentValue: 0,
          },
          {
            id: 'metric-launch',
            label: 'Launch complete',
            type: 'binary',
            direction: 'increase',
            targetValue: true,
            currentValue: false,
          },
        ],
        milestones: [
          {
            id: 'm1',
            title: 'Task throughput stabilized',
            targetDateIso: '2026-06-20T00:00:00.000Z',
            metricId: 'metric-tasks',
            targetValue: 3,
            status: 'pending',
          },
          {
            id: 'm2',
            title: 'Retention baseline improved',
            targetDateIso: '2026-06-25T00:00:00.000Z',
            metricId: 'metric-retention',
            targetValue: 20,
            status: 'pending',
          },
          {
            id: 'm3',
            title: 'Launch shipped',
            targetDateIso: '2026-07-10T00:00:00.000Z',
            metricId: 'metric-launch',
            targetValue: true,
            status: 'pending',
          },
        ],
        nowIso: '2026-06-10T09:00:00.000Z',
      },
      { emitActivity: false }
    );

    const checkIn = recordOutcomeCheckIn(
      {
        userId: goal.userId,
        goalId: goal.id,
        metricValues: {
          'metric-tasks': 4,
          'metric-retention': 22,
          'metric-launch': false,
        },
        atIso: '2026-06-12T09:00:00.000Z',
      },
      { emitActivity: false }
    );

    expect(checkIn).not.toBeNull();

    const refreshed = getOutcomeGoal({ userId: goal.userId, goalId: goal.id });
    expect(refreshed).not.toBeNull();

    const assessment = assessOutcomeGoal({
      goal: refreshed!,
      nowIso: '2026-06-12T09:05:00.000Z',
    });

    expect(assessment.milestonesTotal).toBe(3);
    expect(assessment.milestonesCompleted).toBe(2);
    expect(assessment.progressScore).toBeGreaterThan(0.55);
    expect(['on_track', 'at_risk']).toContain(assessment.status);
  });
});
