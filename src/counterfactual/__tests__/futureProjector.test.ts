import { describe, expect, it } from 'vitest';
import type { Message } from '../../../types';
import { listActivityEvents } from '../../activity';
import { logFutureProjectionActivity, projectFutureOutcome } from '../futureProjector';

const messages: Message[] = [
  {
    id: 'fp-1',
    role: 'user',
    text: 'I am excited but a bit stressed about the launch timeline.',
    timestamp: Date.parse('2026-06-01T10:00:00.000Z'),
  },
  {
    id: 'fp-2',
    role: 'model',
    text: 'Let us keep scope focused and validate market demand each week.',
    timestamp: Date.parse('2026-06-02T10:00:00.000Z'),
  },
];

describe('future projector', () => {
  it('projects 1w/1m/3m outcomes and surfaces prep gaps, team readiness, and market timing risks', () => {
    const projection = projectFutureOutcome({
      userId: 'week63-future-user',
      action: 'launch product next week',
      messages,
      nowIso: '2026-06-03T10:00:00.000Z',
      personaId: 'persona-week63',
    });

    expect(projection.horizons).toHaveLength(3);
    expect(projection.horizons.map((horizon) => horizon.horizon)).toEqual(['1w', '1m', '3m']);

    const riskText = projection.riskFactors.join(' ').toLowerCase();
    expect(riskText).toContain('preparation');
    expect(riskText).toContain('team readiness');
    expect(riskText).toContain('market timing');

    expect(projection.keyDependencies.length).toBeGreaterThan(0);
    expect(projection.confidence.medium).toBeGreaterThan(0);

    logFutureProjectionActivity({
      userId: 'week63-future-user',
      projection,
      threadId: 'thread-week63',
    });

    const activity = listActivityEvents({
      userId: 'week63-future-user',
      filter: {
        searchTerm: 'future projection generated',
      },
      limit: 10,
    });
    expect(activity.some((entry) => entry.eventType === 'counterfactual.future_projection.generated')).toBe(true);
  });
});
