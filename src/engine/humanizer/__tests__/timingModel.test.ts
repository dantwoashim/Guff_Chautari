import { describe, expect, it } from 'vitest';
import { computeTimingPlan } from '../timingModel';

describe('computeTimingPlan', () => {
  it('returns delay and typing duration for each chunk', () => {
    const short = computeTimingPlan({
      text: 'quick check in',
      chunkIndex: 0,
      emotionalComplexity: 0.2,
      readDelay: 500,
    });

    const long = computeTimingPlan({
      text: 'This is a longer response that needs more typing time and slightly more thinking before sending.',
      chunkIndex: 1,
      emotionalComplexity: 0.6,
      readDelay: 1200,
    });

    expect(short.delayBefore).toBeGreaterThan(0);
    expect(short.typingDuration).toBeGreaterThan(0);
    expect(long.typingDuration).toBeGreaterThan(short.typingDuration);
  });
});
