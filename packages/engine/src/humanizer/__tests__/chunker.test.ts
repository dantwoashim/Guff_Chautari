import { describe, expect, it } from 'vitest';
import { chunkResponseText } from '../chunker';

const LONG_TEXT = `I reviewed your draft and there is real progress. The direction is strong, but a few decisions are still fuzzy and will slow execution. First, define what success means this week in measurable terms so you can adjust quickly. Second, prioritize one distribution channel rather than spreading effort across five channels. Third, prepare a repeatable benchmark report with the same structure every Friday. Finally, protect one daily deep-work block and make interruptions explicit exceptions instead of defaults.`;

describe('chunkResponseText', () => {
  it('splits a long response into 2-4 chunks', () => {
    const chunks = chunkResponseText(LONG_TEXT, { minChunks: 2, maxChunks: 4, targetWordsPerChunk: 20 });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.length).toBeLessThanOrEqual(4);
    expect(chunks.every((chunk) => chunk.length > 0)).toBe(true);
  });
});
