import { describe, expect, it } from 'vitest';
import type { HumanizerOutput } from '../types';
import { createLearner } from '../stages/learner';

const makeInput = (): HumanizerOutput => ({
  input: {
    threadId: 'thread-1',
    userId: 'user-1',
    personaId: 'persona-1',
    userMessage: {
      id: 'msg-user',
      role: 'user',
      text: 'My launch deadline is next Friday and I need to keep the scope focused.',
      timestamp: Date.UTC(2026, 3, 20, 11, 0, 0),
    },
    timestamp: Date.UTC(2026, 3, 20, 11, 0, 0),
  },
  context: {
    history: [],
    memories: [],
    time: {
      hour: 11,
      period: 'morning',
      dayType: 'weekday',
      isWeekend: false,
    },
    relationship: {
      stage: 'friend',
      trustScore: 0.7,
      daysTogether: 65,
      messageCount: 100,
      unresolvedTension: false,
    },
    persona: {
      id: 'persona-1',
      name: 'Ashim',
      systemInstruction: 'Be practical.',
    },
  },
  identity: {
    variant: 'morning_self',
    confidence: 0.85,
    energy: 0.76,
    reasons: ['time context'],
  },
  emotional: {
    surface: { label: 'calm', intensity: 0.4, rationale: 'stable' },
    felt: { label: 'calm', intensity: 0.5, rationale: 'stable' },
    suppressed: { label: 'anxiety', intensity: 0.2, rationale: 'minor pressure' },
    unconscious: { label: 'calm', intensity: 0.3, rationale: 'baseline' },
    emotionalDebt: 14,
    dischargeRisk: 0.24,
  },
  prompt: {
    systemInstruction: 'system',
    tiers: {
      immutableCore: 'core',
      sessionDiff: 'diff',
      contextualRetrieval: 'ctx',
      estimatedTokens: 140,
      cprActive: true,
    },
  },
  llm: {
    text: 'We should set a strict launch checklist and cut optional features this week.',
    chunks: [],
    cancelled: false,
    timedOut: false,
    providerId: 'mock',
    model: 'mock-chat',
  },
  humanized: {
    messages: [],
    strategicNonResponse: {
      shouldDelay: false,
      delayMs: 0,
      reason: 'none',
    },
  },
});

describe('learner stage', () => {
  it('extracts at least one memory from a conversation turn', async () => {
    const stage = createLearner({
      persistMemory: async () => Promise.resolve(),
      emitGrowthEvents: async () => Promise.resolve(),
      now: () => Date.UTC(2026, 3, 20, 11, 1, 0),
    });

    const result = await stage.run(makeInput());

    expect(result.learner.extractedMemories.length).toBeGreaterThanOrEqual(1);
  });

  it('produces reflection summary when cadence threshold is hit', async () => {
    const stage = createLearner({
      persistMemory: async () => Promise.resolve(),
      emitGrowthEvents: async () => Promise.resolve(),
      reflectionEveryNMessages: 10,
      reflectionMinMessages: 10,
      now: () => Date.UTC(2026, 3, 20, 11, 1, 0),
    });

    const input = makeInput();
    input.context.relationship.messageCount = 19; // + current turn => 20 (reflection trigger)
    input.context.history = Array.from({ length: 20 }, (_, index) => ({
      id: `hist-${index}`,
      role: index % 2 === 0 ? 'user' : 'model',
      text:
        index % 2 === 0
          ? `I am planning launch step ${index} and trying to keep scope focused.`
          : `Great, let us keep this practical with one benchmarked action ${index}.`,
      timestamp: Date.UTC(2026, 3, 20, 10, 0, 0) + index,
    }));

    const result = await stage.run(input);

    expect(result.learner.reflection).toBeDefined();
    expect(result.learner.reflection?.observationCount).toBeGreaterThanOrEqual(3);
  });
});
