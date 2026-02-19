import {
  getEffectiveEnergy,
  initializeEnergyCycle,
} from '../engine/temporal/energyCycle';
import type { EnergyCycle } from '../engine/temporal';
import {
  createDefaultQuietWindowsConfig,
  evaluateQuietWindows,
  type FocusSession,
  type QuietWindowSeverity,
  type QuietWindowsConfig,
} from './quietWindows';

export type AmbientNotificationIntensity = 'low' | 'balanced' | 'high';
export type EmotionalTrendDirection = 'up' | 'flat' | 'down';

export interface AmbientCalendarEvent {
  id: string;
  title: string;
  startAtIso: string;
  endAtIso: string;
  busy?: boolean;
}

export interface AmbientWorkflowSignal {
  id: string;
  title: string;
  status: 'pending' | 'completed' | 'failed';
  severity?: QuietWindowSeverity;
  updatedAtIso?: string;
}

export interface AmbientEmotionalTrend {
  direction: EmotionalTrendDirection;
  score: number;
}

export interface AmbientModeSettings {
  enabled: boolean;
  notificationIntensity: AmbientNotificationIntensity;
  checkInHourLocal: number;
  quietWindows: QuietWindowsConfig;
}

export interface AmbientContext {
  userId: string;
  nowIso?: string;
  energyCycle?: EnergyCycle;
  calendarEvents?: AmbientCalendarEvent[];
  workflowSignals?: AmbientWorkflowSignal[];
  emotionalTrend?: AmbientEmotionalTrend;
  focusSessions?: FocusSession[];
  lastUserActivityAtIso?: string;
}

export interface AmbientCheckInDecision {
  action: 'send' | 'defer';
  reason:
    | 'ambient_disabled'
    | 'quiet_window'
    | 'morning_busy_schedule'
    | 'low_energy_window'
    | 'critical_workflow_failure'
    | 'workflow_pending'
    | 'emotional_support'
    | 'gentle_evening_prompt'
    | 'no_signal';
  priority: 'low' | 'normal' | 'high';
  message?: string;
  contextTags: string[];
  nextCheckInAfterMinutes: number;
  emergencyOverride?: boolean;
}

export interface AmbientPreviewEntry {
  atIso: string;
  decision: AmbientCheckInDecision;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const parseIsoMs = (iso: string | undefined): number | null => {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
};

const getPeriod = (hour: number): 'morning' | 'afternoon' | 'evening' | 'night' => {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
};

const hasNearBusyCalendarWindow = (
  nowMs: number,
  events: ReadonlyArray<AmbientCalendarEvent>,
  withinMinutes = 90
): boolean => {
  const horizonMs = nowMs + withinMinutes * 60_000;
  return events.some((event) => {
    if (event.busy === false) return false;
    const startMs = parseIsoMs(event.startAtIso);
    const endMs = parseIsoMs(event.endAtIso);
    if (startMs === null || endMs === null) return false;
    return startMs <= horizonMs && endMs >= nowMs;
  });
};

const hoursSince = (nowMs: number, iso: string | undefined): number => {
  const thenMs = parseIsoMs(iso);
  if (thenMs === null || nowMs < thenMs) return Number.POSITIVE_INFINITY;
  return (nowMs - thenMs) / (60 * 60 * 1000);
};

const intensityToIntervalMinutes = (intensity: AmbientNotificationIntensity): number => {
  if (intensity === 'high') return 120;
  if (intensity === 'low') return 480;
  return 240;
};

const friendlyFailureMessage = (failure: AmbientWorkflowSignal | undefined): string =>
  cleanText(
    failure
      ? `Quick heads-up: "${failure.title}" failed and needs your review.`
      : 'Quick heads-up: a critical workflow failed and needs your review.'
  );

const pendingMessage = (pendingCount: number): string =>
  cleanText(
    pendingCount === 1
      ? 'Small check-in: one workflow is pending. Want me to summarize next actions?'
      : `Small check-in: ${pendingCount} workflows are pending. Want a quick summary?`
  );

const eveningMessage = (trend?: AmbientEmotionalTrend): string => {
  if (trend?.direction === 'down') {
    return 'Gentle evening check-in: today felt heavier than usual. Want a 2-minute reset plan?';
  }
  return 'Gentle evening check-in: want to close one small loop before ending the day?';
};

export const createDefaultAmbientModeSettings = (): AmbientModeSettings => ({
  enabled: true,
  notificationIntensity: 'balanced',
  checkInHourLocal: 19,
  quietWindows: createDefaultQuietWindowsConfig(),
});

export const decideAmbientCheckIn = (
  payload: {
    settings: AmbientModeSettings;
    context: AmbientContext;
  }
): AmbientCheckInDecision => {
  const settings = payload.settings;
  const nowIso = payload.context.nowIso ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const now = new Date(nowIso);
  const period = getPeriod(now.getHours());

  if (!settings.enabled) {
    return {
      action: 'defer',
      reason: 'ambient_disabled',
      priority: 'low',
      contextTags: ['ambient:disabled'],
      nextCheckInAfterMinutes: 720,
    };
  }

  const cycle = payload.context.energyCycle ?? initializeEnergyCycle(nowMs);
  const effectiveEnergy = clamp(getEffectiveEnergy(cycle, nowMs), 0, 1);
  const busyCalendar = hasNearBusyCalendarWindow(nowMs, payload.context.calendarEvents ?? []);
  const failures = (payload.context.workflowSignals ?? []).filter(
    (signal) => signal.status === 'failed'
  );
  const criticalFailure = failures.find((signal) => signal.severity === 'critical');
  const pendingCount = (payload.context.workflowSignals ?? []).filter(
    (signal) => signal.status === 'pending'
  ).length;

  const quietEvaluation = evaluateQuietWindows({
    config: settings.quietWindows,
    nowIso,
    eventType: criticalFailure ? 'workflow_failure' : 'check_in',
    severity: criticalFailure?.severity,
    focusSessions: payload.context.focusSessions,
  });

  if (!quietEvaluation.allowed) {
    return {
      action: 'defer',
      reason: 'quiet_window',
      priority: 'low',
      contextTags: ['quiet_window', `quiet_reason:${quietEvaluation.reason}`],
      nextCheckInAfterMinutes: 60,
    };
  }

  if (period === 'morning' && busyCalendar && !criticalFailure) {
    return {
      action: 'defer',
      reason: 'morning_busy_schedule',
      priority: 'low',
      contextTags: ['period:morning', 'calendar:busy'],
      nextCheckInAfterMinutes: 90,
    };
  }

  if (effectiveEnergy < 0.24 && !criticalFailure) {
    return {
      action: 'defer',
      reason: 'low_energy_window',
      priority: 'low',
      contextTags: ['energy:low'],
      nextCheckInAfterMinutes: 120,
    };
  }

  if (criticalFailure) {
    return {
      action: 'send',
      reason: 'critical_workflow_failure',
      priority: 'high',
      message: friendlyFailureMessage(criticalFailure),
      contextTags: ['workflow:critical_failure', ...(quietEvaluation.emergencyOverride ? ['quiet_override'] : [])],
      nextCheckInAfterMinutes: 45,
      emergencyOverride: quietEvaluation.emergencyOverride,
    };
  }

  if (pendingCount > 0 && settings.notificationIntensity !== 'low') {
    return {
      action: 'send',
      reason: 'workflow_pending',
      priority: 'normal',
      message: pendingMessage(pendingCount),
      contextTags: ['workflow:pending'],
      nextCheckInAfterMinutes: intensityToIntervalMinutes(settings.notificationIntensity),
    };
  }

  const trend = payload.context.emotionalTrend;
  if (trend && trend.direction === 'down' && Math.abs(trend.score) >= 0.35) {
    return {
      action: 'send',
      reason: 'emotional_support',
      priority: 'normal',
      message: 'Quick check-in: your recent trend looks heavy. Want a short grounding prompt?',
      contextTags: ['emotion:downward'],
      nextCheckInAfterMinutes: intensityToIntervalMinutes(settings.notificationIntensity),
    };
  }

  const inactivityHours = hoursSince(nowMs, payload.context.lastUserActivityAtIso);
  if (period === 'evening' && inactivityHours >= 3) {
    return {
      action: 'send',
      reason: 'gentle_evening_prompt',
      priority: 'low',
      message: eveningMessage(trend),
      contextTags: ['period:evening', 'inactivity'],
      nextCheckInAfterMinutes: intensityToIntervalMinutes(settings.notificationIntensity),
    };
  }

  return {
    action: 'defer',
    reason: 'no_signal',
    priority: 'low',
    contextTags: ['ambient:no_signal'],
    nextCheckInAfterMinutes: intensityToIntervalMinutes(settings.notificationIntensity),
  };
};

const withHour = (baseIso: string, hourLocal: number): string => {
  const date = new Date(baseIso);
  date.setHours(clamp(Math.round(hourLocal), 0, 23), 0, 0, 0);
  return date.toISOString();
};

export const buildAmbientPreview = (payload: {
  settings: AmbientModeSettings;
  context: Omit<AmbientContext, 'nowIso'>;
  nowIso?: string;
  days?: number;
}): AmbientPreviewEntry[] => {
  const days = Math.max(1, Math.min(14, payload.days ?? 7));
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const entries: AmbientPreviewEntry[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(nowIso);
    date.setDate(date.getDate() - offset);
    const atIso = withHour(date.toISOString(), payload.settings.checkInHourLocal);

    const decision = decideAmbientCheckIn({
      settings: payload.settings,
      context: {
        ...payload.context,
        nowIso: atIso,
      },
    });

    entries.push({ atIso, decision });
  }

  return entries.sort((left, right) => Date.parse(right.atIso) - Date.parse(left.atIso));
};
