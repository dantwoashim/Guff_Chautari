import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addCorrections,
  addInterruption,
  chunkResponse,
  shouldTrailOff,
} from '../messageChunker';

describe('messageChunker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps short responses as a single chunk', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const result = chunkResponse('short message');

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].text).toBe('short message');
    expect(result.totalDuration).toBeGreaterThan(0);
  });

  it('detects trail-off intent for uncertain phrases', () => {
    expect(shouldTrailOff('idk maybe we can try later')).toBe(true);
  });

  it('returns chunks unchanged when interruption is disabled', () => {
    const chunks = [
      { text: 'one', delay: 0, showTyping: true, typingDuration: 1000 },
      { text: 'two', delay: 300, showTyping: true, typingDuration: 1100 },
    ];
    expect(addInterruption(chunks)).toEqual(chunks);
  });

  it('adds correction text when correction probability path is taken', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const original = 'we should do this.';
    const corrected = addCorrections('we should do this.');
    expect(corrected).not.toBe(original);
  });
});
