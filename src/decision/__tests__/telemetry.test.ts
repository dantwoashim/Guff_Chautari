import { describe, expect, it } from 'vitest';
import { DecisionTelemetry } from '../telemetry';

describe('decision telemetry', () => {
  it('records creation, completion, and follow-through events', () => {
    let tick = Date.parse('2026-06-09T10:00:00.000Z');
    const telemetry = new DecisionTelemetry(() => {
      const current = new Date(tick).toISOString();
      tick += 1000;
      return current;
    });

    telemetry.recordDecisionCreated('decision-9', 3, 4);
    telemetry.recordDecisionCompleted('decision-9', 'opt-b', 2);
    telemetry.recordDecisionFollowThrough('decision-9', 'success', 0.88);

    const events = telemetry.listByDecision('decision-9');

    expect(events.length).toBe(3);
    expect(events[0].type).toBe('decision_created');
    expect(events[1].type).toBe('decision_completed');
    expect(events[2].type).toBe('decision_follow_through');
  });
});
