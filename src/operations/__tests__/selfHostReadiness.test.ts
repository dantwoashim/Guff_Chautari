import { describe, expect, it } from 'vitest';
import { evaluateSelfHostReadiness } from '../selfHostReadiness';

describe('self-host readiness evaluator', () => {
  it('marks stack ready when required services are healthy and score threshold is met', () => {
    const report = evaluateSelfHostReadiness({
      nowIso: '2026-10-20T09:00:00.000Z',
      services: [
        { service: 'app', required: true, status: 'healthy' },
        { service: 'supabase-db', required: true, status: 'healthy' },
        { service: 'grafana', required: false, status: 'degraded' },
      ],
    });

    expect(report.ready).toBe(true);
    expect(report.score).toBeGreaterThanOrEqual(report.threshold);
    expect(report.blockers).toHaveLength(0);
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it('marks stack not ready when a required service is down', () => {
    const report = evaluateSelfHostReadiness({
      nowIso: '2026-10-20T09:00:00.000Z',
      services: [
        { service: 'app', required: true, status: 'down', message: 'container crashloop' },
        { service: 'supabase-db', required: true, status: 'healthy' },
      ],
    });

    expect(report.ready).toBe(false);
    expect(report.blockers.join(' ')).toMatch(/app is down/i);
  });
});
