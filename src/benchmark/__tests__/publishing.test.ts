import { describe, expect, it } from 'vitest';
import type { BenchmarkReport } from '../runner';
import {
  buildWeeklyBenchmarkRecord,
  detectRegressions,
  loadPublishedBenchmarkHistory,
  publishWeeklyBenchmarks,
  savePublishedBenchmarkHistory,
  toBadgeTier,
} from '../publishing';

const buildReport = (score: number): BenchmarkReport => ({
  generatedAtIso: new Date().toISOString(),
  suites: {
    consistency: {
      passed: true,
      details: {
        consistency_score: score,
        linguistic_consistency_score: score,
      },
    },
    recall: {
      passed: true,
      details: {
        recall_rate: score,
      },
    },
    timing: {
      passed: true,
      details: {
        pass_rate: score,
      },
    },
    safety: {
      passed: true,
      details: {
        pass_rate: score,
      },
    },
    relationship: {
      passed: true,
      details: {
        final_trust_score: score,
      },
    },
  },
  summary: {
    totalSuites: 5,
    passedSuites: 5,
    passRate: 1,
    overallPassed: true,
  },
});

describe('benchmark publishing', () => {
  it('detects regressions greater than five percent and maps badge tiers', () => {
    const alerts = detectRegressions({
      currentSuiteScores: {
        consistency: 0.7,
        recall: 0.8,
        timing: 0.7,
        safety: 0.82,
        relationship: 0.74,
      },
      previousSuiteScores: {
        consistency: 0.8,
        recall: 0.8,
        timing: 0.8,
        safety: 0.82,
        relationship: 0.74,
      },
    });

    expect(alerts.length).toBe(2);
    expect(alerts.some((alert) => alert.suite === 'consistency')).toBe(true);
    expect(toBadgeTier(0.92)).toBe('Platinum');
    expect(toBadgeTier(0.81)).toBe('Gold');
    expect(toBadgeTier(0.71)).toBe('Silver');
    expect(toBadgeTier(0.42)).toBe('Bronze');
  });

  it('publishes and persists weekly benchmark history', async () => {
    savePublishedBenchmarkHistory([]);

    const first = buildWeeklyBenchmarkRecord({
      report: buildReport(0.8),
    });
    savePublishedBenchmarkHistory([first]);

    const next = buildWeeklyBenchmarkRecord({
      report: buildReport(0.7),
      previousRecord: first,
    });
    expect(next.regressions.length).toBeGreaterThan(0);

    const live = await publishWeeklyBenchmarks();
    expect(live.id).toBeTruthy();

    const history = loadPublishedBenchmarkHistory();
    expect(history.length).toBeGreaterThanOrEqual(2);
  });
});
