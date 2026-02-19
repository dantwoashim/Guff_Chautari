import { describe, expect, it } from 'vitest';
import { evaluateReleaseGate, week80DefaultReleaseChecks } from '../releaseGate';

describe('release gate evaluator', () => {
  it('returns ready report for passing/default checks', () => {
    const report = evaluateReleaseGate({
      nowIso: '2026-10-20T09:00:00.000Z',
      checks: week80DefaultReleaseChecks(),
      minimumScore: 0.75,
    });

    expect(report.ready).toBe(true);
    expect(report.blockers).toHaveLength(0);
    expect(report.score).toBeGreaterThanOrEqual(0.75);
  });

  it('blocks release when required checks fail', () => {
    const report = evaluateReleaseGate({
      nowIso: '2026-10-20T09:00:00.000Z',
      checks: [
        {
          id: 'tests',
          category: 'quality',
          label: 'Tests',
          required: true,
          status: 'fail',
        },
        {
          id: 'docs',
          category: 'documentation',
          label: 'Docs',
          required: true,
          status: 'pass',
        },
      ],
    });

    expect(report.ready).toBe(false);
    expect(report.blockers).toHaveLength(1);
    expect(report.blockers[0].id).toBe('tests');
  });
});
