import { describe, expect, it } from 'vitest';
import { createTemporalSchedule, resolveScheduleState } from '../schedule';

describe('temporal schedule', () => {
  it('resolves schedule block for daytime worker schedule', () => {
    const schedule = createTemporalSchedule('worker');
    const timestamp = new Date('2026-08-11T10:30:00').getTime();
    const state = resolveScheduleState(schedule, timestamp);

    expect(state.currentBlock.mode).toBe('busy');
    expect(state.minutesToNextBlock).toBeGreaterThan(0);
  });

  it('supports night owl schedule patterns', () => {
    const schedule = createTemporalSchedule('night_owl');
    const timestamp = new Date('2026-08-11T23:15:00').getTime();
    const state = resolveScheduleState(schedule, timestamp);

    expect(['available', 'away']).toContain(state.currentBlock.mode);
  });
});
