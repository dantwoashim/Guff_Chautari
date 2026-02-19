import { describe, expect, it } from 'vitest';
import type { EmotionalProcessorOutput } from '../types';
import { createPromptBuilder } from '../stages/promptBuilder';

const makeInput = (): EmotionalProcessorOutput => ({
  input: {
    threadId: 'thread-1',
    userId: 'user-1',
    personaId: 'persona-1',
    userMessage: {
      id: 'msg-1',
      role: 'user',
      text: 'How should I structure my creator launch and benchmark progress?',
      timestamp: Date.UTC(2026, 3, 14, 16, 0, 0),
    },
    timestamp: Date.UTC(2026, 3, 14, 16, 0, 0),
  },
  context: {
    history: [
      {
        id: 'h-1',
        role: 'user',
        text: 'I want benchmark-driven growth for my product.',
        timestamp: Date.UTC(2026, 3, 14, 15, 20, 0),
      },
    ],
    memories: [
      {
        id: 'mem-1',
        content: 'User is building a creator-focused product and tracks growth weekly.',
        type: 'semantic',
        score: 0.91,
        emotionalValence: 0.2,
        timestamp: Date.UTC(2026, 3, 12, 10, 0, 0),
      },
    ],
    time: {
      hour: 16,
      period: 'afternoon',
      dayType: 'weekday',
      isWeekend: false,
    },
    relationship: {
      stage: 'friend',
      trustScore: 0.72,
      daysTogether: 45,
      messageCount: 88,
      unresolvedTension: false,
    },
    persona: {
      id: 'persona-1',
      name: 'Ashim',
      systemInstruction:
        'You are a rigorous strategic operator. Prioritize measurable outcomes, practical constraints, and decisive action.',
      aspects: [
        {
          id: 'a-1',
          title: 'Benchmark Mindset',
          content: 'Tie recommendations to measurable benchmarks and weekly targets.',
          keywords: ['benchmark', 'metrics', 'scorecard', 'weekly'],
          estimatedTokens: 45,
        },
        {
          id: 'a-2',
          title: 'Creator Growth Loops',
          content: 'Use creator feedback loops and public proof-of-work for distribution.',
          keywords: ['creator', 'distribution', 'growth', 'community'],
          estimatedTokens: 44,
        },
      ],
      emotionalDebt: 18,
    },
  },
  identity: {
    variant: 'afternoon_self',
    confidence: 0.84,
    energy: 0.66,
    reasons: ['time context'],
  },
  emotional: {
    surface: { label: 'calm', intensity: 0.52, rationale: 'stable' },
    felt: { label: 'calm', intensity: 0.57, rationale: 'stable' },
    suppressed: { label: 'neutral', intensity: 0.16, rationale: 'low tension' },
    unconscious: { label: 'calm', intensity: 0.22, rationale: 'secure pattern' },
    emotionalDebt: 18,
    dischargeRisk: 0.23,
  },
});

describe('promptBuilder', () => {
  it('builds a prompt with core persona, session diff, and contextual retrieval tiers', async () => {
    const stage = createPromptBuilder();
    const result = await stage.run(makeInput());

    expect(result.prompt.systemInstruction).toContain('[CORE_PERSONA]');
    expect(result.prompt.systemInstruction).toContain('[SESSION_STATE_DIFF]');
    expect(result.prompt.systemInstruction).toContain('[CONTEXTUAL_RETRIEVAL]');
    expect(result.prompt.systemInstruction).toContain('[LINGUISTIC_IDENTITY]');
    expect(result.prompt.systemInstruction).toContain('[TEMPORAL_CONTEXT]');

    expect(result.prompt.tiers.immutableCore.length).toBeGreaterThan(0);
    expect(result.prompt.tiers.sessionDiff.length).toBeGreaterThan(0);
    expect(result.prompt.tiers.contextualRetrieval.length).toBeGreaterThan(0);
    expect(result.prompt.tiers.cprActive).toBe(true);
    expect(result.prompt.tiers.estimatedTokens).toBeLessThanOrEqual(800);
  });
});
