import { describe, expect, it } from 'vitest';
import type { IdentityResolverOutput } from '../types';
import { createEmotionalProcessor } from '../stages/emotionalProcessor';

const makeIdentityOutput = (emotionalDebt: number): IdentityResolverOutput => ({
  input: {
    threadId: 'thread-1',
    userId: 'user-1',
    personaId: 'persona-1',
    userMessage: {
      id: 'msg-1',
      role: 'user',
      text: 'I am stressed and overwhelmed by money problems.',
      timestamp: Date.UTC(2026, 3, 11, 20, 0, 0),
    },
    timestamp: Date.UTC(2026, 3, 11, 20, 0, 0),
  },
  context: {
    history: [],
    memories: [],
    time: {
      hour: 20,
      period: 'evening',
      dayType: 'weekday',
      isWeekend: false,
    },
    relationship: {
      stage: 'close',
      trustScore: 0.8,
      daysTogether: 120,
      messageCount: 320,
      unresolvedTension: true,
    },
    persona: {
      id: 'persona-1',
      name: 'Ashim',
      systemInstruction: 'Be practical.',
      emotionalDebt,
      attachmentStyle: 'anxious',
    },
  },
  identity: {
    variant: 'stressed_self',
    confidence: 0.91,
    energy: 0.45,
    reasons: ['stress detected'],
  },
});

describe('emotionalProcessor', () => {
  it('produces four-layer emotional output with high discharge risk for high debt', async () => {
    const stage = createEmotionalProcessor();
    const result = await stage.run(makeIdentityOutput(72));

    expect(result.emotional.surface.label).toBeTruthy();
    expect(result.emotional.felt.label).toBeTruthy();
    expect(result.emotional.suppressed.label).toBeTruthy();
    expect(result.emotional.unconscious.label).toBeTruthy();
    expect(result.emotional.dischargeRisk).toBeGreaterThan(0.5);
  });
});
