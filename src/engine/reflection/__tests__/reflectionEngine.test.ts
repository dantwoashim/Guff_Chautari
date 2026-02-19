import { describe, expect, it } from 'vitest';
import type { Message } from '../../../../types';
import { runReflectionSession, shouldRunReflection } from '../reflectionEngine';

const message = (index: number): Message => ({
  id: `m-${index}`,
  role: index % 2 === 0 ? 'user' : 'model',
  text:
    index % 2 === 0
      ? `I am planning week ${index} launch scope and feeling stressed about deadlines.`
      : `Let us keep scope focused and maintain momentum with a clear plan ${index}.`,
  timestamp: Date.now() + index,
});

describe('reflectionEngine', () => {
  it('decides when reflection should run based on cadence', () => {
    expect(shouldRunReflection(12, { minConversationMessages: 10, reflectionEveryNMessages: 6 })).toBe(true);
    expect(shouldRunReflection(11, { minConversationMessages: 10, reflectionEveryNMessages: 6 })).toBe(false);
  });

  it('produces a reflection session with observations and patterns', () => {
    const messages = Array.from({ length: 24 }, (_, index) => message(index));
    const session = runReflectionSession({
      threadId: 'thread-1',
      personaId: 'persona-1',
      messages,
      now: Date.UTC(2026, 7, 15, 12, 0, 0),
      config: {
        minConversationMessages: 10,
        maxWindow: 24,
      },
    });

    expect(session.observations.length).toBeGreaterThanOrEqual(3);
    expect(session.patterns.length).toBeGreaterThanOrEqual(2);
    expect(session.evolution.vocabularyAdds.length).toBeGreaterThanOrEqual(1);
  });
});
