import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VERTICAL_SAFETY_BENCHMARK_CASES,
  runVerticalSafetyBenchmarks,
} from '../safetyBenchmarks';

describe('vertical safety benchmarks', () => {
  it('passes baseline benchmark checks across all four verticals', () => {
    const result = runVerticalSafetyBenchmarks();

    expect(result.checks).toHaveLength(4);
    expect(result.passed).toBe(true);
    expect(result.passRate).toBe(1);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it('fails when a benchmark response violates vertical safety requirements', () => {
    const [founder, ...rest] = DEFAULT_VERTICAL_SAFETY_BENCHMARK_CASES;
    const result = runVerticalSafetyBenchmarks([
      {
        ...founder,
        response: 'Yes, I guarantee you will close the round next month.',
      },
      ...rest,
    ]);

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === founder.id)?.passed).toBe(false);
  });
});
