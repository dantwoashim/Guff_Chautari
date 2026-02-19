import { describe, expect, it } from 'vitest';
import type { ContextGathererOutput } from '../types';
import { createIdentityResolver } from '../stages/identityResolver';

const makeContextOutput = (
  period: ContextGathererOutput['context']['time']['period']
): ContextGathererOutput => ({
  input: {
    threadId: 'thread-1',
    userId: 'user-1',
    personaId: 'persona-1',
    userMessage: {
      id: 'msg-1',
      role: 'user',
      text: 'How are you?',
      timestamp: Date.UTC(2026, 3, 10, 8, 0, 0),
    },
    timestamp: Date.UTC(2026, 3, 10, 8, 0, 0),
  },
  context: {
    history: [],
    memories: [],
    time: {
      hour: period === 'morning' ? 8 : 19,
      period,
      dayType: 'weekday',
      isWeekend: false,
    },
    relationship: {
      stage: 'friend',
      trustScore: 0.65,
      daysTogether: 30,
      messageCount: 40,
      unresolvedTension: false,
    },
    persona: {
      id: 'persona-1',
      name: 'Ashim',
      systemInstruction: 'Be thoughtful.',
      emotionalDebt: 10,
    },
  },
});

describe('identityResolver', () => {
  it('resolves morning context to morning-self identity', async () => {
    const stage = createIdentityResolver();
    const result = await stage.run(makeContextOutput('morning'));

    expect(result.identity.variant).toBe('morning_self');
    expect(result.identity.energy).toBeGreaterThan(0.7);
  });

  it('resolves evening context to evening-self identity', async () => {
    const stage = createIdentityResolver();
    const result = await stage.run(makeContextOutput('evening'));

    expect(result.identity.variant).toBe('evening_self');
    expect(result.identity.confidence).toBeGreaterThan(0.75);
  });
});
