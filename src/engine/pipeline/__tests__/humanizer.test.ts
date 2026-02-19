import { describe, expect, it } from 'vitest';
import type { LLMCallerOutput } from '../types';
import { createHumanizer } from '../stages/humanizer';

const makeInput = (): LLMCallerOutput => ({
  input: {
    threadId: 'thread-1',
    userId: 'user-1',
    personaId: 'persona-1',
    userMessage: {
      id: 'user-1',
      role: 'user',
      text: 'I am overwhelmed and need a concrete plan for this week.',
      timestamp: Date.UTC(2026, 3, 20, 9, 0, 0),
    },
    timestamp: Date.UTC(2026, 3, 20, 9, 0, 0),
  },
  context: {
    history: [],
    memories: [],
    time: {
      hour: 9,
      period: 'morning',
      dayType: 'weekday',
      isWeekend: false,
    },
    relationship: {
      stage: 'friend',
      trustScore: 0.72,
      daysTogether: 44,
      messageCount: 90,
      unresolvedTension: true,
    },
    persona: {
      id: 'persona-1',
      name: 'Ashim',
      systemInstruction: 'Be practical and direct.',
      emotionalDebt: 33,
    },
  },
  identity: {
    variant: 'stressed_self',
    confidence: 0.9,
    energy: 0.42,
    reasons: ['stress signal'],
  },
  emotional: {
    surface: { label: 'frustration', intensity: 0.7, rationale: 'visible stress' },
    felt: { label: 'frustration', intensity: 0.78, rationale: 'internal stress' },
    suppressed: { label: 'anxiety', intensity: 0.58, rationale: 'debt buildup' },
    unconscious: { label: 'anxiety', intensity: 0.4, rationale: 'pattern' },
    emotionalDebt: 33,
    dischargeRisk: 0.74,
  },
  prompt: {
    systemInstruction: 'system',
    tiers: {
      immutableCore: 'core',
      sessionDiff: 'diff',
      contextualRetrieval: 'ctx',
      estimatedTokens: 120,
      cprActive: true,
    },
  },
  llm: {
    text: 'Start with one weekly goal that is measurable and time-bound. Then define three daily actions that directly influence that goal. Remove every nonessential task for five days and track completion with a strict end-of-day scorecard.',
    chunks: [],
    cancelled: false,
    timedOut: false,
    providerId: 'mock',
    model: 'mock-chat',
  },
});

describe('humanizer stage', () => {
  it('converts long response into 2-4 timed message chunks', async () => {
    const stage = createHumanizer();
    const result = await stage.run(makeInput());

    expect(result.humanized.messages.length).toBeGreaterThanOrEqual(2);
    expect(result.humanized.messages.length).toBeLessThanOrEqual(4);
    expect(
      result.humanized.messages.every((message) => message.delayBefore > 0 && message.typingDuration > 0)
    ).toBe(true);
  });

  it('applies temporal availability delays when persona is unavailable', async () => {
    const stage = createHumanizer();
    const input = makeInput();
    input.context.temporal = {
      energyLevel: 0.3,
      availability: {
        available: false,
        mode: 'busy',
        reason: 'Focused block',
        suggestedDelayMs: 9_000,
      },
      schedule: {
        blockLabel: 'Focused Work',
        minutesToNextBlock: 40,
        isWeekend: false,
      },
      activeEvents: [],
    };

    const result = await stage.run(input);

    expect(result.humanized.strategicNonResponse.shouldDelay).toBe(true);
    expect(result.humanized.strategicNonResponse.delayMs).toBeGreaterThanOrEqual(9_000);
  });
});
