import { describe, expect, it } from 'vitest';
import { detectBeliefChanges } from '../beliefDetector';

describe('belief detector', () => {
  it('detects stance shift from contractor to in-house and captures trigger', () => {
    const changes = detectBeliefChanges({
      userId: 'user-belief',
      messages: [
        {
          id: 'm1',
          text: 'I think we should hire a contractor to move faster.',
          timestamp: Date.parse('2026-03-01T09:00:00.000Z'),
        },
        {
          id: 'm2',
          text: 'After reviewing delivery quality, I believe we should build this in-house.',
          timestamp: Date.parse('2026-03-12T11:00:00.000Z'),
        },
      ],
      minimumConfidence: 0.5,
    });

    expect(changes).toHaveLength(1);
    expect(changes[0].topic).toBe('resourcing strategy');
    expect(changes[0].oldStance).toBe('hire contractor');
    expect(changes[0].newStance).toBe('build in-house');
    expect(changes[0].triggerEventId).toBe('m2');
    expect(changes[0].confidence).toBeGreaterThan(0.5);
  });
});
