import { describe, expect, it } from 'vitest';
import { evaluateCertificationCandidate } from '../evaluator';
import type { CertificationCandidate } from '../types';

const baseCandidate = (): CertificationCandidate => ({
  id: 'candidate-founder-pack',
  name: 'Founder Pack',
  kind: 'template',
  version: '1.0.0',
  schemaValid: true,
  benchmarkScore: 0.86,
  safetySignals: [
    {
      id: 'safety-1',
      passed: true,
      severity: 'info',
      message: 'No critical policy violations.',
    },
  ],
  documentation: {
    readme: true,
    setupGuide: true,
    apiReference: true,
    changelog: true,
  },
  creator: {
    tier: 'Certified',
    approvedPackages: 3,
    trustScore: 0.87,
  },
});

describe('certification evaluator', () => {
  it('certifies compliant packages and assigns level', () => {
    const result = evaluateCertificationCandidate(baseCandidate(), {
      nowIso: '2026-10-14T10:00:00.000Z',
    });

    expect(result.certified).toBe(true);
    expect(result.level).toBe('gold');
    expect(result.failureReasons).toHaveLength(0);
    expect(result.score).toBeGreaterThan(0.7);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it('fails with explicit reasons when benchmark/safety/tier are below requirements', () => {
    const candidate = baseCandidate();
    candidate.benchmarkScore = 0.42;
    candidate.creator.tier = undefined;
    candidate.documentation.apiReference = false;
    candidate.safetySignals = [
      {
        id: 'safety-crit',
        passed: false,
        severity: 'critical',
        message: 'Critical violation: generated unsafe medical advice.',
      },
    ];

    const result = evaluateCertificationCandidate(candidate, {
      nowIso: '2026-10-14T10:00:00.000Z',
    });

    expect(result.certified).toBe(false);
    expect(result.level).toBe('none');
    expect(result.failureReasons.join(' ')).toMatch(/below minimum|critical/i);
    expect(result.checks.some((check) => !check.passed && check.requirementId === 'benchmark_minimum')).toBe(
      true
    );
    expect(
      result.checks.some((check) => !check.passed && check.requirementId === 'safety_policy_compliance')
    ).toBe(true);
  });
});
