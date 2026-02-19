import { describe, expect, it } from 'vitest';
import { buildTemporalMemoryIndex } from '../temporalIndex';
import { answerTemporalQuery } from '../queryEngine';
import type { MemorySnapshot } from '../types';

const snapshot = (overrides: Partial<MemorySnapshot>): MemorySnapshot => ({
  id: overrides.id ?? 'snapshot',
  userId: overrides.userId ?? 'user-query',
  occurredAtIso: overrides.occurredAtIso ?? '2026-04-01T09:00:00.000Z',
  lane: overrides.lane ?? 'beliefs',
  topic: overrides.topic ?? 'user retention',
  summary: overrides.summary ?? 'I started caring about user retention due to churn spikes.',
  sourceType: overrides.sourceType ?? 'message',
  sourceId: overrides.sourceId ?? 'message-1',
  confidence: overrides.confidence ?? 0.8,
  metadata: overrides.metadata,
});

describe('time-machine query engine', () => {
  it('answers when user started caring about retention with dated context', () => {
    const index = buildTemporalMemoryIndex({
      userId: 'user-query',
      snapshots: [
        snapshot({
          id: 'belief-origin',
          occurredAtIso: '2026-04-10T10:00:00.000Z',
          lane: 'beliefs',
          topic: 'user retention',
          summary: 'I care about user retention now that churn increased.',
        }),
        snapshot({
          id: 'belief-later',
          occurredAtIso: '2026-05-02T10:00:00.000Z',
          lane: 'beliefs',
          topic: 'user retention',
          summary: 'Retention became a weekly KPI in the team review.',
        }),
      ],
      nowIso: '2026-05-03T10:00:00.000Z',
    });

    const answer = answerTemporalQuery({
      query: 'When did I start caring about user retention?',
      index,
      nowIso: '2026-05-03T10:00:00.000Z',
    });

    expect(answer.intent).toBe('belief_origin');
    expect(answer.answer).toContain('Apr');
    expect(answer.matches.length).toBeGreaterThan(0);
    expect(answer.matches[0].topic).toContain('user retention');
  });
});
