import { describe, expect, it } from 'vitest';
import { runMemoryRecallBenchmark } from '../memoryRecallBenchmark';

describe('memoryRecallBenchmark', () => {
  it('meets controlled memory recall target of at least 65%', async () => {
    const result = await runMemoryRecallBenchmark({
      factCount: 20,
      turns: 100,
      retrievalLimit: 3,
      targetRate: 0.65,
    });

    expect(result.plantedFacts).toBe(20);
    expect(result.turns).toBe(100);
    expect(result.recallRate).toBeGreaterThanOrEqual(0.65);
    expect(result.passed).toBe(true);
  });
});

