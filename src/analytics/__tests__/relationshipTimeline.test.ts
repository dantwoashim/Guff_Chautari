import { describe, expect, it } from 'vitest';
import type { Message } from '../../../types';
import { buildRelationshipTimeline } from '../relationshipTimeline';

const mkMessage = (id: string, text: string, offsetHours: number): Message => ({
  id,
  role: id.endsWith('a') ? 'model' : 'user',
  text,
  timestamp: Date.parse('2026-10-01T09:00:00.000Z') + offsetHours * 60 * 60 * 1000,
});

describe('relationship timeline', () => {
  it('tracks stage transitions with trust evolution entries', () => {
    const messages: Message[] = [
      mkMessage('m1', 'Thanks for helping me with this.', 0),
      mkMessage('m2', 'I appreciate your consistency and support.', 8),
      mkMessage('m3', 'This was great progress today.', 20),
      mkMessage('m4', 'I feel frustrated and upset about delays.', 36),
      mkMessage('m5', 'Thanks for repairing this quickly.', 48),
      mkMessage('m6', 'Great follow-through and helpful guidance.', 60),
      mkMessage('m7', 'I trust this process now.', 84),
    ];

    const timeline = buildRelationshipTimeline({
      personaId: 'persona-1',
      messages,
    });

    expect(timeline.entries.length).toBeGreaterThan(0);
    expect(timeline.currentStage.length).toBeGreaterThan(0);
    expect(typeof timeline.entries[0].trustScore).toBe('number');
  });
});
