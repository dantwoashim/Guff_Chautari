import { describe, expect, it } from 'vitest';
import { GeminiContextCache } from '../../../providers';
import { DifferentialPersonaLoader } from '../differentialLoader';

const tokenEstimate = (value: string): number => {
  const words = value
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
  return Math.ceil(words / 0.75);
};

describe('DifferentialPersonaLoader', () => {
  it('reuses immutable core cache id within same session', () => {
    const cache = new GeminiContextCache({
      now: (() => {
        let tick = 1;
        return () => tick++;
      })(),
    });
    const loader = new DifferentialPersonaLoader({ cache });

    const baseInput = {
      personaId: 'persona-1',
      sessionId: 'thread-1',
      systemInstruction: 'You are practical, warm, and precise. Focus on measurable outcomes.',
      aspects: [
        {
          id: 'a1',
          title: 'Execution Discipline',
          content: 'Prioritize a small number of high-leverage actions.',
          keywords: ['execution', 'focus', 'priority'],
          estimatedTokens: 38,
        },
      ],
      runtimeState: {
        identityVariant: 'morning_self',
        identityConfidence: 0.84,
        energy: 0.76,
        relationshipStage: 'friend',
        trustScore: 0.71,
        emotionalSummary: 'stable',
        timePeriod: 'morning',
      },
      userMessage: 'How should I prioritize work today?',
      recentHistory: ['I need a better weekly plan'],
      memoryHints: ['User values measurable progress'],
    } as const;

    const first = loader.compose(baseInput);
    const second = loader.compose(baseInput);

    expect(first.immutableCoreCacheId).toBeDefined();
    expect(first.coreCacheReused).toBe(false);
    expect(second.immutableCoreCacheId).toBe(first.immutableCoreCacheId);
    expect(second.coreCacheReused).toBe(true);
  });

  it('emits compact session diff with only changed state and keeps patch under 150 tokens', () => {
    const loader = new DifferentialPersonaLoader({ cache: new GeminiContextCache() });

    const first = loader.compose({
      personaId: 'persona-2',
      sessionId: 'thread-2',
      systemInstruction: 'Stay practical and concise.',
      aspects: [],
      runtimeState: {
        identityVariant: 'morning_self',
        identityConfidence: 0.9,
        energy: 0.8,
        relationshipStage: 'friend',
        trustScore: 0.7,
        emotionalSummary: 'calm',
        timePeriod: 'morning',
      },
      userMessage: 'hello',
      recentHistory: [],
    });

    const second = loader.compose({
      personaId: 'persona-2',
      sessionId: 'thread-2',
      systemInstruction: 'Stay practical and concise.',
      aspects: [],
      runtimeState: {
        identityVariant: 'morning_self',
        identityConfidence: 0.9,
        energy: 0.62,
        relationshipStage: 'friend',
        trustScore: 0.7,
        emotionalSummary: 'calm',
        timePeriod: 'morning',
      },
      userMessage: 'hello again',
      recentHistory: [],
    });

    expect(first.sessionDiff.length).toBeGreaterThan(0);
    expect(second.sessionDiff).toContain('energy=0.62');
    expect(second.sessionDiff).not.toContain('trust_score=0.70');
    expect(tokenEstimate(second.sessionDiff)).toBeLessThanOrEqual(150);
  });
});
