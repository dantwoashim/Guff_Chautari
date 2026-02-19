import { describe, expect, it } from 'vitest';
import { runVerticalBenchmarks } from '../benchmarks';
import { founderVerticalConfig } from '../founder/config';
import { researchVerticalConfig } from '../research/config';

describe('vertical benchmark framework', () => {
  it('runs Founder OS benchmark suite and returns expected score envelope', () => {
    const result = runVerticalBenchmarks({
      vertical: founderVerticalConfig,
      observations: {
        decision_consistency: 0.83,
        follow_through_rate: 0.87,
        okr_tracking_accuracy: 0.9,
      },
      nowIso: '2026-02-18T12:00:00.000Z',
    });

    expect(result.verticalId).toBe('founder_os');
    expect(result.summary.count).toBe(1);
    expect(result.summary.passed).toBe(1);
    expect(result.summary.weightedScore).toBeGreaterThan(0.7);
    expect(result.benchmarks[0].dimensions.length).toBe(3);
  });

  it('flags failing dimensions when observations drop below minimums', () => {
    const result = runVerticalBenchmarks({
      vertical: researchVerticalConfig,
      observations: {
        citation_integrity: 0.6,
        argument_clarity: 0.62,
        synthesis_depth: 0.7,
      },
      nowIso: '2026-02-18T12:10:00.000Z',
    });

    expect(result.summary.passed).toBe(0);
    expect(result.summary.passRate).toBe(0);
    expect(result.benchmarks[0].passed).toBe(false);
    expect(result.benchmarks[0].dimensions.some((dimension) => dimension.passed === false)).toBe(true);
  });
});
