import { describe, expect, it } from 'vitest';
import { createDefaultQuietWindowsConfig } from '../../voice/quietWindows';
import { generateOutcomeNudges } from '../nudgeEngine';
import type { OutcomeAssessment } from '../types';

const assessment = (overrides: Partial<OutcomeAssessment> = {}): OutcomeAssessment => ({
  goalId: overrides.goalId ?? 'goal-1',
  userId: overrides.userId ?? 'user-1',
  generatedAtIso: overrides.generatedAtIso ?? '2026-08-08T23:30:00.000Z',
  status: overrides.status ?? 'behind',
  progressScore: overrides.progressScore ?? 0.42,
  milestonesCompleted: overrides.milestonesCompleted ?? 1,
  milestonesTotal: overrides.milestonesTotal ?? 4,
  overdueMilestones: overrides.overdueMilestones ?? 2,
  summary: overrides.summary ?? 'Behind pace',
  nextActions: overrides.nextActions ?? ['Take action'],
});

describe('outcome nudge engine', () => {
  it('generates behind-pace nudge and defers during quiet window', () => {
    const quietConfig = createDefaultQuietWindowsConfig();
    quietConfig.sleepWindow.startLocalTime = '22:00';
    quietConfig.sleepWindow.endLocalTime = '07:00';

    const result = generateOutcomeNudges({
      userId: 'user-1',
      assessments: [assessment()],
      nowIso: '2026-08-08T23:30:00.000Z',
      quietWindowsConfig: quietConfig,
    });

    expect(result.nudges).toHaveLength(1);
    expect(result.nudges[0].deferred).toBe(true);
    expect(result.nudges[0].type).toBe('quiet_window_deferred');
    expect(result.deferredCount).toBe(1);
  });

  it('keeps behind-pace nudge active outside quiet windows', () => {
    const quietConfig = createDefaultQuietWindowsConfig();
    quietConfig.enabled = false;

    const result = generateOutcomeNudges({
      userId: 'user-1',
      assessments: [assessment()],
      nowIso: '2026-08-08T15:30:00.000Z',
      quietWindowsConfig: quietConfig,
    });

    expect(result.nudges[0].deferred).toBe(false);
    expect(result.nudges[0].type).toBe('behind_pace');
  });
});
