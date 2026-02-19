import { describe, expect, it } from 'vitest';
import { createDefaultAmbientModeSettings, decideAmbientCheckIn } from '../ambientMode';

describe('ambient mode check-ins', () => {
  it('defers check-ins in morning when calendar is busy', () => {
    const settings = createDefaultAmbientModeSettings();
    settings.quietWindows.enabled = false;
    const decision = decideAmbientCheckIn({
      settings,
      context: {
        userId: 'user-ambient',
        nowIso: '2026-03-09T08:15:00',
        calendarEvents: [
          {
            id: 'event-1',
            title: 'Standup',
            startAtIso: '2026-03-09T08:30:00',
            endAtIso: '2026-03-09T09:00:00',
            busy: true,
          },
        ],
      },
    });

    expect(decision.action).toBe('defer');
    expect(decision.reason).toBe('morning_busy_schedule');
  });

  it('generates gentle evening prompt when activity is low', () => {
    const settings = createDefaultAmbientModeSettings();
    settings.quietWindows.enabled = false;

    const decision = decideAmbientCheckIn({
      settings,
      context: {
        userId: 'user-ambient',
        nowIso: '2026-03-09T19:00:00',
        lastUserActivityAtIso: '2026-03-09T14:20:00',
        calendarEvents: [],
      },
    });

    expect(decision.action).toBe('send');
    expect(decision.reason).toBe('gentle_evening_prompt');
    expect((decision.message ?? '').toLowerCase()).toContain('gentle');
  });
});
