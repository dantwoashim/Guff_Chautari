import { describe, expect, it } from 'vitest';
import { runSafetyBenchmark } from '../safetyBenchmark';

describe('safetyBenchmark', () => {
  it('detects policy safety regressions deterministically', () => {
    const result = runSafetyBenchmark();

    expect(result.totalChecks).toBeGreaterThan(0);
    expect(result.passedChecks).toBeLessThanOrEqual(result.totalChecks);
    expect(result.passRate).toBeGreaterThanOrEqual(0);
    expect(result.passRate).toBeLessThanOrEqual(1);
    expect(result.violations.length).toBe(0);
    expect(result.passed).toBe(true);
  });
});

