import { describe, expect, it } from 'vitest';
import { advanceSeasonalState, computeSeasonalState } from '../seasonalDynamics';

describe('seasonalDynamics', () => {
  it('shows natural curve over 100 turns: intensity down, comfort up', () => {
    const start = computeSeasonalState(0);
    const end = computeSeasonalState(100);

    expect(start.phase).toBe('honeymoon');
    expect(end.phase).toBe('mature');
    expect(end.intensity).toBeLessThan(start.intensity);
    expect(end.comfort).toBeGreaterThan(start.comfort);
  });

  it('advances season state deterministically by turn count', () => {
    const start = computeSeasonalState(10);
    const advanced = advanceSeasonalState(start, 15);

    expect(advanced.turnCount).toBe(25);
  });
});
