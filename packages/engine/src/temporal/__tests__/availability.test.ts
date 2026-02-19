import { describe, expect, it } from 'vitest';
import { computeAvailabilityWindow } from '../availability';
import type { ScheduleState } from '../types';

const makeState = (mode: ScheduleState['currentBlock']['mode']): ScheduleState => ({
  hour: 10,
  isWeekend: false,
  minutesToNextBlock: 45,
  currentBlock: {
    id: 'x',
    label: 'x',
    startHour: 9,
    endHour: 17,
    mode,
  },
});

describe('availability', () => {
  it('returns unavailable for sleeping windows', () => {
    const result = computeAvailabilityWindow(makeState('sleeping'), 0.7);
    expect(result.available).toBe(false);
    expect(result.suggestedDelayMs).toBeGreaterThan(0);
  });

  it('returns delayed unavailable for busy windows', () => {
    const result = computeAvailabilityWindow(makeState('busy'), 0.3);
    expect(result.available).toBe(false);
    expect(result.mode).toBe('busy');
  });

  it('returns available for high-energy available windows', () => {
    const result = computeAvailabilityWindow(makeState('available'), 0.75);
    expect(result.available).toBe(true);
    expect(result.suggestedDelayMs).toBe(0);
  });
});
