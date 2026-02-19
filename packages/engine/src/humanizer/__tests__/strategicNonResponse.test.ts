import { describe, expect, it } from 'vitest';
import { planStrategicNonResponse } from '../strategicNonResponse';

describe('planStrategicNonResponse', () => {
  it('returns delayed-response plan for tense, high-complexity late-night turns', () => {
    const result = planStrategicNonResponse({
      relationshipStage: 'close',
      emotionalComplexity: 0.92,
      unresolvedTension: true,
      period: 'late_night',
    });

    expect(result.shouldDelay).toBe(true);
    expect(result.delayMs).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(result.delayMs).toBeLessThanOrEqual(45 * 60 * 1000);
  });
});
