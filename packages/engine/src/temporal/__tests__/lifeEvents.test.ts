import { describe, expect, it } from 'vitest';
import {
  applyLifeEventMoodShift,
  createDefaultLifeEvents,
  getActiveLifeEvents,
} from '../lifeEvents';

describe('lifeEvents', () => {
  it('selects active events for current day', () => {
    const now = new Date('2026-08-15T12:00:00').getTime();
    const events = createDefaultLifeEvents(now);
    const active = getActiveLifeEvents(events, now);

    expect(active.length).toBeGreaterThan(0);
  });

  it('applies mood shifts from active events', () => {
    const shifted = applyLifeEventMoodShift(0.2, [
      { id: '1', title: 'Holiday', dateIso: '2026-08-15', type: 'holiday', moodShift: 0.2 },
      { id: '2', title: 'Birthday', dateIso: '2026-08-15', type: 'birthday', moodShift: 0.1 },
    ]);

    expect(shifted).toBe(0.5);
  });
});
