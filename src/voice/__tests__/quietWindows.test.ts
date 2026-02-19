import { describe, expect, it } from 'vitest';
import {
  createDefaultQuietWindowsConfig,
  evaluateQuietWindows,
} from '../quietWindows';

describe('quiet windows', () => {
  it('suppresses proactive check-ins during quiet window', () => {
    const config = createDefaultQuietWindowsConfig();
    config.sleepWindow.startLocalTime = '22:00';
    config.sleepWindow.endLocalTime = '07:00';

    const result = evaluateQuietWindows({
      config,
      nowIso: '2026-03-09T23:30:00.000Z',
      eventType: 'check_in',
      severity: 'low',
    });

    expect(result.allowed).toBe(false);
    expect(result.inQuietWindow).toBe(true);
    expect(result.reason).toBe('sleep_window');
    expect(result.emergencyOverride).toBe(false);
  });

  it('allows emergency override for critical workflow failure', () => {
    const config = createDefaultQuietWindowsConfig();
    config.sleepWindow.startLocalTime = '22:00';
    config.sleepWindow.endLocalTime = '07:00';
    config.emergencyOverride.allowCriticalWorkflowFailures = true;

    const result = evaluateQuietWindows({
      config,
      nowIso: '2026-03-09T23:30:00.000Z',
      eventType: 'workflow_failure',
      severity: 'critical',
    });

    expect(result.allowed).toBe(true);
    expect(result.inQuietWindow).toBe(true);
    expect(result.reason).toBe('emergency_override');
    expect(result.emergencyOverride).toBe(true);
  });
});
