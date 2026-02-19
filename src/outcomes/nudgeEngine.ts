import {
  createDefaultQuietWindowsConfig,
  evaluateQuietWindows,
  type FocusSession,
  type QuietWindowsConfig,
} from '../voice/quietWindows';
import type {
  OutcomeAssessment,
  OutcomeGoal,
  OutcomeNudge,
  OutcomeNudgeBatch,
} from './types';

interface NudgeInput {
  userId: string;
  assessments: ReadonlyArray<OutcomeAssessment>;
  goals?: ReadonlyArray<OutcomeGoal>;
  nowIso?: string;
  quietWindowsConfig?: QuietWindowsConfig;
  focusSessions?: FocusSession[];
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const addMinutesIso = (iso: string, minutes: number): string => {
  return new Date(toMs(iso) + minutes * 60 * 1000).toISOString();
};

const buildStatusNudge = (assessment: OutcomeAssessment, nowIso: string): OutcomeNudge => {
  if (assessment.status === 'behind') {
    return {
      id: makeId('outcome-nudge'),
      userId: assessment.userId,
      goalId: assessment.goalId,
      createdAtIso: nowIso,
      type: 'behind_pace',
      priority: 'high',
      title: 'Outcome behind pace',
      message: `You're behind on this outcome. Want me to adjust your schedule for the next 48 hours?`,
      deferred: false,
    };
  }

  if (assessment.status === 'at_risk') {
    return {
      id: makeId('outcome-nudge'),
      userId: assessment.userId,
      goalId: assessment.goalId,
      createdAtIso: nowIso,
      type: 'at_risk',
      priority: 'medium',
      title: 'Outcome at risk',
      message: 'Progress is slowing. Want to set one focused execution block today?',
      deferred: false,
    };
  }

  if (assessment.status === 'achieved') {
    return {
      id: makeId('outcome-nudge'),
      userId: assessment.userId,
      goalId: assessment.goalId,
      createdAtIso: nowIso,
      type: 'milestone_achieved',
      priority: 'low',
      title: 'Milestone achieved',
      message: 'Great work. Ready to define your next milestone?',
      deferred: false,
    };
  }

  return {
    id: makeId('outcome-nudge'),
    userId: assessment.userId,
    goalId: assessment.goalId,
    createdAtIso: nowIso,
    type: 'on_track',
    priority: 'low',
    title: 'On-track momentum',
    message: 'You are on pace. Keep the cadence and protect your best execution window.',
    deferred: false,
  };
};

const withQuietWindowDeferral = (
  nudge: OutcomeNudge,
  payload: {
    nowIso: string;
    config: QuietWindowsConfig;
    focusSessions?: FocusSession[];
  }
): OutcomeNudge => {
  const quietEvaluation = evaluateQuietWindows({
    config: payload.config,
    nowIso: payload.nowIso,
    eventType: 'check_in',
    severity: 'low',
    focusSessions: payload.focusSessions,
  });

  if (quietEvaluation.allowed) return nudge;

  return {
    ...nudge,
    type: 'quiet_window_deferred',
    deferred: true,
    deliverAfterIso: addMinutesIso(payload.nowIso, 60),
    message: `${nudge.message} Deferred due to quiet window (${quietEvaluation.reason}).`,
  };
};

const hasRecentCompletedMilestone = (goal: OutcomeGoal | undefined, nowIso: string): boolean => {
  if (!goal) return false;

  const nowMs = toMs(nowIso);
  return goal.milestones.some((milestone) => {
    if (milestone.status !== 'completed' || !milestone.completedAtIso) return false;
    const diff = nowMs - toMs(milestone.completedAtIso);
    return diff >= 0 && diff <= 3 * 24 * 60 * 60 * 1000;
  });
};

export const generateOutcomeNudges = (payload: NudgeInput): OutcomeNudgeBatch => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const quietWindowsConfig = payload.quietWindowsConfig ?? createDefaultQuietWindowsConfig();

  const goalById = new Map((payload.goals ?? []).map((goal) => [goal.id, goal]));

  const raw = payload.assessments
    .map((assessment) => {
      const goal = goalById.get(assessment.goalId);

      // Elevate successful nudges when a milestone was just completed.
      if (assessment.status === 'on_track' && hasRecentCompletedMilestone(goal, nowIso)) {
        return {
          id: makeId('outcome-nudge'),
          userId: assessment.userId,
          goalId: assessment.goalId,
          createdAtIso: nowIso,
          type: 'milestone_achieved',
          priority: 'low',
          title: 'Milestone achieved',
          message: 'You hit a milestone. Want to lock the next milestone while momentum is high?',
          deferred: false,
        } satisfies OutcomeNudge;
      }

      return buildStatusNudge(assessment, nowIso);
    })
    .map((nudge) =>
      withQuietWindowDeferral(nudge, {
        nowIso,
        config: quietWindowsConfig,
        focusSessions: payload.focusSessions,
      })
    )
    .sort((left, right) => {
      const priorityRank: Record<OutcomeNudge['priority'], number> = { high: 3, medium: 2, low: 1 };
      if (priorityRank[right.priority] !== priorityRank[left.priority]) {
        return priorityRank[right.priority] - priorityRank[left.priority];
      }
      return left.goalId.localeCompare(right.goalId);
    });

  return {
    generatedAtIso: nowIso,
    nudges: raw,
    deferredCount: raw.filter((nudge) => nudge.deferred).length,
  };
};
