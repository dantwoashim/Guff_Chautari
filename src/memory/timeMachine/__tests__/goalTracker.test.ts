import { describe, expect, it } from 'vitest';
import { trackGoalEvolution } from '../goalTracker';

describe('goal tracker', () => {
  it('tracks goal lifecycle arc including pivot at week 5', () => {
    const goals = trackGoalEvolution({
      userId: 'user-goal',
      activityEvents: [
        {
          id: 'e1',
          eventType: 'goal.created',
          title: 'Goal created',
          description: 'Set new growth goal.',
          createdAtIso: '2026-01-05T09:00:00.000Z',
          metadata: {
            goal_id: 'goal-growth',
            goal_title: 'Reach 10k weekly active users',
          },
        },
        {
          id: 'e2',
          eventType: 'goal.progress',
          title: 'Progress update',
          description: 'Reached 3k weekly active users.',
          createdAtIso: '2026-01-19T09:00:00.000Z',
          metadata: {
            goal_id: 'goal-growth',
            goal_title: 'Reach 10k weekly active users',
          },
        },
        {
          id: 'e3',
          eventType: 'goal.pivoted',
          title: 'Pivot decision',
          description: 'Pivoted toward retention-first growth strategy.',
          createdAtIso: '2026-02-02T09:00:00.000Z',
          metadata: {
            goal_id: 'goal-growth',
            goal_title: 'Reach 10k weekly active users',
          },
        },
      ],
    });

    expect(goals).toHaveLength(1);
    expect(goals[0].goalId).toBe('goal-growth');
    expect(goals[0].currentStatus).toBe('pivoted');
    expect(goals[0].pivotCount).toBe(1);

    const statuses = goals[0].history.map((stage) => stage.status);
    expect(statuses).toEqual(['created', 'progressing', 'pivoted']);
  });
});
