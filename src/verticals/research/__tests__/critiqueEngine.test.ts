import { describe, expect, it } from 'vitest';
import { critiqueWritingSample } from '../critiqueEngine';

describe('research critique engine', () => {
  it('flags uncited claims and scores citation strength accordingly', () => {
    const result = critiqueWritingSample({
      text:
        'This method demonstrates superior recall in all settings. Therefore, it should be adopted immediately. The study confirms this trend [Smith, 2024].',
      nowIso: '2026-02-18T13:00:00.000Z',
    });

    expect(result.stats.uncitedClaims).toBeGreaterThanOrEqual(1);
    expect(result.scores.citationStrength).toBeLessThan(1);
    expect(result.issues.some((issue) => issue.type === 'citation_strength')).toBe(true);
  });

  it('produces high citation coverage when claims are supported', () => {
    const result = critiqueWritingSample({
      text:
        'The experiment indicates improved retention [Garcia, 2023]. Because the sample includes multiple cohorts [Lee, 2024], the claim remains stable under replication [Khan, 2025].',
      nowIso: '2026-02-18T13:05:00.000Z',
    });

    expect(result.stats.citedClaims).toBeGreaterThanOrEqual(2);
    expect(result.stats.uncitedClaims).toBe(0);
    expect(result.scores.citationStrength).toBeGreaterThanOrEqual(0.95);
  });
});
