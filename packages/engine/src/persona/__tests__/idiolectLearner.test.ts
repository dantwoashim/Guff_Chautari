import { describe, expect, it } from 'vitest';
import type { Message } from '../../../../types';
import { learnIdiolectPatterns, summarizeIdiolect } from '../idiolectLearner';

const makeMessage = (text: string): Message => ({
  id: `msg-${text.length}-${text.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8) || 'x'}`,
  role: 'user',
  text,
  timestamp: Date.now(),
});

describe('idiolectLearner', () => {
  it('extracts sentence length, emoji rate, and top terms from user messages', () => {
    const messages: Message[] = [
      makeMessage('Hey bro, this launch plan is kinda tight 😅'),
      makeMessage('We should keep scope focused and ship one thing first.'),
      makeMessage('Ngl this weekly checklist vibe helps lol'),
    ];

    const patterns = learnIdiolectPatterns(messages, { topTermLimit: 5 });

    expect(patterns.sampleCount).toBe(3);
    expect(patterns.avgSentenceLength).toBeGreaterThan(0);
    expect(patterns.topTerms.length).toBeGreaterThan(0);
    expect(patterns.emojiRate).toBeGreaterThan(0);
    expect(patterns.slangTerms).toContain('bro');
  });

  it('summarizes idiolect with compact telemetry-friendly format', () => {
    const summary = summarizeIdiolect({
      sampleCount: 2,
      avgSentenceLength: 9.5,
      emojiRate: 0.5,
      topTerms: ['launch', 'scope'],
      slangTerms: ['ngl'],
    });

    expect(summary).toContain('samples=2');
    expect(summary).toContain('top_terms=launch|scope');
  });
});
