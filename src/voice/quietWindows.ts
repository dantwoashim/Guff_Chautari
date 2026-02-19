export type QuietWindowType = 'sleep' | 'focus' | 'custom' | 'manual_dnd';
export type QuietWindowEventType = 'check_in' | 'workflow_failure' | 'security_event' | 'manual';
export type QuietWindowSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface QuietWindowRule {
  id: string;
  label: string;
  enabled: boolean;
  startLocalTime: string;
  endLocalTime: string;
  days?: number[];
  type: QuietWindowType;
}

export interface FocusSession {
  id: string;
  title?: string;
  startAtIso: string;
  endAtIso: string;
  enabled?: boolean;
}

export interface QuietWindowsConfig {
  enabled: boolean;
  manualDndUntilIso?: string;
  sleepWindow: QuietWindowRule;
  customWindows: QuietWindowRule[];
  focusSessionsEnabled: boolean;
  emergencyOverride: {
    allowCriticalWorkflowFailures: boolean;
    allowSecurityEvents: boolean;
  };
}

export interface QuietWindowHit {
  type: QuietWindowType;
  ruleId: string;
  label: string;
}

export interface QuietWindowEvaluation {
  allowed: boolean;
  inQuietWindow: boolean;
  reason:
    | 'not_in_quiet_window'
    | 'manual_dnd'
    | 'sleep_window'
    | 'focus_session'
    | 'custom_window'
    | 'quiet_window_blocked'
    | 'emergency_override';
  quietHit?: QuietWindowHit;
  emergencyOverride: boolean;
}

const parseTimeToMinutes = (value: string): number | null => {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const isTimeWithinWindow = (payload: {
  nowDay: number;
  nowMinutes: number;
  startMinutes: number;
  endMinutes: number;
  days?: number[];
}): boolean => {
  const matchesDay = (day: number): boolean =>
    !payload.days || payload.days.length === 0 || payload.days.includes(day);

  if (payload.startMinutes === payload.endMinutes) {
    return matchesDay(payload.nowDay);
  }

  if (payload.startMinutes < payload.endMinutes) {
    return (
      matchesDay(payload.nowDay) &&
      payload.nowMinutes >= payload.startMinutes &&
      payload.nowMinutes < payload.endMinutes
    );
  }

  const previousDay = (payload.nowDay + 6) % 7;
  return (
    (matchesDay(payload.nowDay) && payload.nowMinutes >= payload.startMinutes) ||
    (matchesDay(previousDay) && payload.nowMinutes < payload.endMinutes)
  );
};

const doesRuleApplyNow = (rule: QuietWindowRule, nowDate: Date): boolean => {
  if (!rule.enabled) return false;
  const startMinutes = parseTimeToMinutes(rule.startLocalTime);
  const endMinutes = parseTimeToMinutes(rule.endLocalTime);
  if (startMinutes === null || endMinutes === null) return false;
  const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();

  return isTimeWithinWindow({
    nowDay: nowDate.getDay(),
    nowMinutes,
    startMinutes,
    endMinutes,
    days: rule.days,
  });
};

const parseIsoMs = (iso: string | undefined): number | null => {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
};

const isCriticalEmergency = (payload: {
  eventType?: QuietWindowEventType;
  severity?: QuietWindowSeverity;
  config: QuietWindowsConfig;
}): boolean => {
  if (payload.eventType === 'security_event') {
    return payload.config.emergencyOverride.allowSecurityEvents && payload.severity !== 'low';
  }

  if (payload.eventType === 'workflow_failure') {
    return (
      payload.config.emergencyOverride.allowCriticalWorkflowFailures &&
      payload.severity === 'critical'
    );
  }

  return false;
};

export const createDefaultQuietWindowsConfig = (): QuietWindowsConfig => ({
  enabled: true,
  sleepWindow: {
    id: 'sleep-default',
    label: 'Sleep',
    enabled: true,
    startLocalTime: '23:00',
    endLocalTime: '07:00',
    days: [0, 1, 2, 3, 4, 5, 6],
    type: 'sleep',
  },
  customWindows: [],
  focusSessionsEnabled: true,
  emergencyOverride: {
    allowCriticalWorkflowFailures: true,
    allowSecurityEvents: true,
  },
});

export const detectActiveQuietWindow = (payload: {
  config: QuietWindowsConfig;
  nowIso?: string;
  focusSessions?: FocusSession[];
}): QuietWindowHit | null => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const nowDate = new Date(nowIso);

  if (!payload.config.enabled) return null;

  const manualDndUntilMs = parseIsoMs(payload.config.manualDndUntilIso);
  if (manualDndUntilMs !== null && manualDndUntilMs > nowDate.getTime()) {
    return {
      type: 'manual_dnd',
      ruleId: 'manual-dnd',
      label: 'Manual DND',
    };
  }

  if (doesRuleApplyNow(payload.config.sleepWindow, nowDate)) {
    return {
      type: 'sleep',
      ruleId: payload.config.sleepWindow.id,
      label: payload.config.sleepWindow.label,
    };
  }

  if (payload.config.focusSessionsEnabled && payload.focusSessions && payload.focusSessions.length > 0) {
    const nowMs = nowDate.getTime();
    const active = payload.focusSessions.find((session) => {
      if (session.enabled === false) return false;
      const startMs = parseIsoMs(session.startAtIso);
      const endMs = parseIsoMs(session.endAtIso);
      if (startMs === null || endMs === null) return false;
      return nowMs >= startMs && nowMs < endMs;
    });
    if (active) {
      return {
        type: 'focus',
        ruleId: active.id,
        label: active.title || 'Focus Session',
      };
    }
  }

  const custom = payload.config.customWindows.find((rule) => doesRuleApplyNow(rule, nowDate));
  if (custom) {
    return {
      type: 'custom',
      ruleId: custom.id,
      label: custom.label,
    };
  }

  return null;
};

export const evaluateQuietWindows = (payload: {
  config: QuietWindowsConfig;
  nowIso?: string;
  eventType?: QuietWindowEventType;
  severity?: QuietWindowSeverity;
  focusSessions?: FocusSession[];
}): QuietWindowEvaluation => {
  const hit = detectActiveQuietWindow({
    config: payload.config,
    nowIso: payload.nowIso,
    focusSessions: payload.focusSessions,
  });

  if (!hit) {
    return {
      allowed: true,
      inQuietWindow: false,
      reason: 'not_in_quiet_window',
      emergencyOverride: false,
    };
  }

  if (
    isCriticalEmergency({
      eventType: payload.eventType,
      severity: payload.severity,
      config: payload.config,
    })
  ) {
    return {
      allowed: true,
      inQuietWindow: true,
      reason: 'emergency_override',
      quietHit: hit,
      emergencyOverride: true,
    };
  }

  const reasonByType: Record<QuietWindowType, QuietWindowEvaluation['reason']> = {
    manual_dnd: 'manual_dnd',
    sleep: 'sleep_window',
    focus: 'focus_session',
    custom: 'custom_window',
  };

  return {
    allowed: false,
    inQuietWindow: true,
    reason: reasonByType[hit.type] ?? 'quiet_window_blocked',
    quietHit: hit,
    emergencyOverride: false,
  };
};
