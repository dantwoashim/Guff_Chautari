import { describe, expect, it } from 'vitest';
import { runTimingBenchmark } from '../timingBenchmark';

describe('timingBenchmark', () => {
  it('returns bounded timing metrics with stable pass-rate output', () => {
    const result = runTimingBenchmark();

    expect(result.sampleCount).toBeGreaterThan(0);
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.averageReadDelayMs).toBeGreaterThanOrEqual(400);
    expect(result.p95TypingDurationMs).toBeGreaterThan(0);
    expect(result.passRate).toBeGreaterThanOrEqual(0);
    expect(result.passRate).toBeLessThanOrEqual(1);
  });
});

