import { emitActivityEvent, type ActivityStore, activityStore } from '../activity';
import type {
  OutcomeAssessment,
  OutcomeAssessmentStatus,
  OutcomeCheckIn,
  OutcomeCheckInFrequency,
  OutcomeDirection,
  OutcomeGoal,
  OutcomeGoalStatus,
  OutcomeMetric,
  OutcomeMetricType,
  OutcomeMetricValue,
  OutcomeMilestone,
  OutcomeWeeklyScorecard,
} from './types';

const STORAGE_KEY = 'ashim.outcomes.v1';
const MAX_GOALS = 300;
const MAX_CHECKINS = 6000;

interface OutcomeState {
  goals: OutcomeGoal[];
  checkIns: OutcomeCheckIn[];
  updatedAtIso: string;
}

interface TrackerDependencies {
  activityStore?: ActivityStore;
  emitActivity?: boolean;
}

interface CreateOutcomeGoalInput {
  userId: string;
  title: string;
  description: string;
  checkInFrequency?: OutcomeCheckInFrequency;
  metrics: OutcomeMetric[];
  milestones?: OutcomeMilestone[];
  linkedWorkflows?: string[];
  linkedDecisions?: string[];
  linkedHabits?: string[];
  status?: OutcomeGoalStatus;
  startDateIso?: string;
  targetDateIso?: string;
  nowIso?: string;
}

interface UpdateOutcomeGoalInput {
  userId: string;
  goalId: string;
  patch: Partial<Omit<OutcomeGoal, 'id' | 'userId' | 'createdAtIso'>>;
  nowIso?: string;
}

interface RecordOutcomeCheckInInput {
  userId: string;
  goalId: string;
  metricValues: Record<string, OutcomeMetricValue>;
  note?: string;
  atIso?: string;
}

const inMemoryStorage = new Map<string, string>();

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
};

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const readRaw = (): string | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Fall through.
    }
  }

  return inMemoryStorage.get(STORAGE_KEY) ?? null;
};

const writeRaw = (value: string): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
      return;
    } catch {
      // Fall through.
    }
  }

  inMemoryStorage.set(STORAGE_KEY, value);
};

const emptyState = (): OutcomeState => ({
  goals: [],
  checkIns: [],
  updatedAtIso: new Date(0).toISOString(),
});

const isOutcomeMetric = (value: unknown): value is OutcomeMetric => {
  if (!value || typeof value !== 'object') return false;
  const metric = value as Partial<OutcomeMetric>;
  return (
    typeof metric.id === 'string' &&
    typeof metric.label === 'string' &&
    typeof metric.type === 'string' &&
    typeof metric.direction === 'string' &&
    metric.targetValue !== undefined
  );
};

const isGoal = (value: unknown): value is OutcomeGoal => {
  if (!value || typeof value !== 'object') return false;
  const goal = value as Partial<OutcomeGoal>;
  return (
    typeof goal.id === 'string' &&
    typeof goal.userId === 'string' &&
    typeof goal.title === 'string' &&
    typeof goal.description === 'string' &&
    typeof goal.status === 'string' &&
    Array.isArray(goal.metrics) &&
    goal.metrics.every((metric) => isOutcomeMetric(metric))
  );
};

const isCheckIn = (value: unknown): value is OutcomeCheckIn => {
  if (!value || typeof value !== 'object') return false;
  const checkIn = value as Partial<OutcomeCheckIn>;
  return (
    typeof checkIn.id === 'string' &&
    typeof checkIn.userId === 'string' &&
    typeof checkIn.goalId === 'string' &&
    typeof checkIn.atIso === 'string' &&
    !!checkIn.metricValues &&
    typeof checkIn.metricValues === 'object'
  );
};

const loadState = (): OutcomeState => {
  const raw = readRaw();
  if (!raw) return emptyState();

  try {
    const parsed = JSON.parse(raw) as Partial<OutcomeState>;
    return {
      goals: Array.isArray(parsed.goals) ? parsed.goals.filter((entry) => isGoal(entry)) : [],
      checkIns: Array.isArray(parsed.checkIns)
        ? parsed.checkIns.filter((entry) => isCheckIn(entry))
        : [],
      updatedAtIso: typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
    };
  } catch {
    return emptyState();
  }
};

const saveState = (state: OutcomeState): void => {
  writeRaw(
    JSON.stringify({
      ...state,
      goals: [...state.goals].slice(-MAX_GOALS),
      checkIns: [...state.checkIns].slice(-MAX_CHECKINS),
      updatedAtIso: state.updatedAtIso,
    } satisfies OutcomeState)
  );
};

const meetsTarget = (payload: {
  type: OutcomeMetricType;
  direction: OutcomeDirection;
  value: OutcomeMetricValue;
  target: OutcomeMetricValue;
}): boolean => {
  if (payload.type === 'binary') {
    return Boolean(payload.value) === Boolean(payload.target);
  }

  if (payload.type === 'qualitative') {
    return normalize(String(payload.value)) === normalize(String(payload.target));
  }

  const valueNum = Number(payload.value);
  const targetNum = Number(payload.target);
  if (!Number.isFinite(valueNum) || !Number.isFinite(targetNum)) return false;

  if (payload.direction === 'increase') return valueNum >= targetNum;
  if (payload.direction === 'decrease') return valueNum <= targetNum;
  return Math.abs(valueNum - targetNum) <= Math.max(1, Math.abs(targetNum) * 0.05);
};

const qualitativeScore = (value: string): number => {
  const normalized = normalize(value);
  if (!normalized) return 0;
  if (/excellent|great|strong|good|done|complete|healthy/.test(normalized)) return 1;
  if (/okay|ok|moderate|partial|improving/.test(normalized)) return 0.65;
  if (/bad|poor|weak|blocked|risk|behind/.test(normalized)) return 0.25;
  return 0.5;
};

export const scoreMetricProgress = (metric: OutcomeMetric): number => {
  const current = metric.currentValue;
  if (current === undefined || current === null) return 0;

  if (metric.type === 'binary') {
    return Boolean(current) === Boolean(metric.targetValue) ? 1 : 0;
  }

  if (metric.type === 'qualitative') {
    return qualitativeScore(String(current));
  }

  const currentNum = Number(current);
  const targetNum = Number(metric.targetValue);
  if (!Number.isFinite(currentNum) || !Number.isFinite(targetNum)) return 0;

  if (metric.direction === 'increase') {
    return clamp01(targetNum === 0 ? 1 : currentNum / targetNum);
  }

  if (metric.direction === 'decrease') {
    if (currentNum <= targetNum) return 1;
    if (targetNum === 0) return 0;
    return clamp01(targetNum / currentNum);
  }

  const denominator = Math.max(1, Math.abs(targetNum));
  return clamp01(1 - Math.abs(currentNum - targetNum) / denominator);
};

const applyMilestoneStatus = (
  milestone: OutcomeMilestone,
  goal: OutcomeGoal,
  metricValues: Record<string, OutcomeMetricValue>,
  atIso: string
): OutcomeMilestone => {
  if (milestone.status === 'completed') return milestone;

  const nowMs = toMs(atIso);
  const dueMs = toMs(milestone.targetDateIso);
  const metric = milestone.metricId ? goal.metrics.find((entry) => entry.id === milestone.metricId) : null;

  if (metric && metricValues[milestone.metricId ?? ''] !== undefined && milestone.targetValue !== undefined) {
    const met = meetsTarget({
      type: metric.type,
      direction: metric.direction,
      value: metricValues[milestone.metricId ?? ''],
      target: milestone.targetValue,
    });

    if (met) {
      return {
        ...milestone,
        status: 'completed',
        completedAtIso: atIso,
      };
    }

    if (dueMs <= nowMs) {
      return {
        ...milestone,
        status: 'overdue',
      };
    }

    return {
      ...milestone,
      status: 'in_progress',
    };
  }

  if (dueMs <= nowMs) {
    return {
      ...milestone,
      status: 'overdue',
    };
  }

  return milestone;
};

const emitOutcomeActivity = (
  payload: {
    userId: string;
    eventType: string;
    title: string;
    description: string;
    goalId: string;
    metadata?: Record<string, string | number | boolean | null>;
    createdAtIso?: string;
  },
  dependencies: TrackerDependencies
): void => {
  if (dependencies.emitActivity === false) return;

  emitActivityEvent(
    {
      userId: payload.userId,
      category: 'outcome',
      eventType: payload.eventType,
      title: payload.title,
      description: payload.description,
      createdAtIso: payload.createdAtIso,
      metadata: {
        goal_id: payload.goalId,
        ...(payload.metadata ?? {}),
      },
    },
    dependencies.activityStore ?? activityStore
  );
};

const normalizeMetrics = (metrics: ReadonlyArray<OutcomeMetric>, nowIso: string): OutcomeMetric[] => {
  return metrics.map((metric) => ({
    ...metric,
    updatedAtIso: metric.updatedAtIso ?? nowIso,
  }));
};

const normalizeMilestones = (milestones: ReadonlyArray<OutcomeMilestone>): OutcomeMilestone[] => {
  return [...milestones].sort((left, right) => toMs(left.targetDateIso) - toMs(right.targetDateIso));
};

export const createOutcomeGoal = (
  payload: CreateOutcomeGoalInput,
  dependencies: TrackerDependencies = {}
): OutcomeGoal => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const state = loadState();

  const goal: OutcomeGoal = {
    id: makeId('outcome-goal'),
    userId: payload.userId,
    title: payload.title.trim(),
    description: payload.description.trim(),
    status: payload.status ?? 'active',
    checkInFrequency: payload.checkInFrequency ?? 'weekly',
    metrics: normalizeMetrics(payload.metrics, nowIso),
    milestones: normalizeMilestones(payload.milestones ?? []),
    linkedWorkflows: [...(payload.linkedWorkflows ?? [])],
    linkedDecisions: [...(payload.linkedDecisions ?? [])],
    linkedHabits: [...(payload.linkedHabits ?? [])],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    startDateIso: payload.startDateIso,
    targetDateIso: payload.targetDateIso,
  };

  saveState({
    goals: [goal, ...state.goals.filter((entry) => !(entry.userId === goal.userId && entry.id === goal.id))],
    checkIns: state.checkIns,
    updatedAtIso: nowIso,
  });

  emitOutcomeActivity(
    {
      userId: goal.userId,
      goalId: goal.id,
      eventType: 'outcome.goal_created',
      title: 'Outcome goal created',
      description: `${goal.title} was added with ${goal.milestones.length} milestone(s).`,
      createdAtIso: nowIso,
      metadata: {
        milestone_count: goal.milestones.length,
      },
    },
    dependencies
  );

  return goal;
};

export const updateOutcomeGoal = (
  payload: UpdateOutcomeGoalInput,
  dependencies: TrackerDependencies = {}
): OutcomeGoal | null => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const state = loadState();
  const goal = state.goals.find((entry) => entry.userId === payload.userId && entry.id === payload.goalId);
  if (!goal) return null;

  const updated: OutcomeGoal = {
    ...goal,
    ...payload.patch,
    metrics: payload.patch.metrics ? normalizeMetrics(payload.patch.metrics, nowIso) : goal.metrics,
    milestones: payload.patch.milestones ? normalizeMilestones(payload.patch.milestones) : goal.milestones,
    updatedAtIso: nowIso,
  };

  saveState({
    goals: [updated, ...state.goals.filter((entry) => !(entry.userId === payload.userId && entry.id === payload.goalId))],
    checkIns: state.checkIns,
    updatedAtIso: nowIso,
  });

  emitOutcomeActivity(
    {
      userId: updated.userId,
      goalId: updated.id,
      eventType: 'outcome.goal_updated',
      title: 'Outcome goal updated',
      description: `Updated ${updated.title}.`,
      createdAtIso: nowIso,
    },
    dependencies
  );

  return updated;
};

export const listOutcomeGoals = (payload: {
  userId: string;
  statuses?: ReadonlyArray<OutcomeGoalStatus>;
  limit?: number;
}): OutcomeGoal[] => {
  const statuses = payload.statuses && payload.statuses.length > 0 ? new Set(payload.statuses) : null;
  const limit = Math.max(1, payload.limit ?? 200);

  return loadState()
    .goals
    .filter((goal) => goal.userId === payload.userId)
    .filter((goal) => (statuses ? statuses.has(goal.status) : true))
    .sort((left, right) => toMs(right.updatedAtIso) - toMs(left.updatedAtIso))
    .slice(0, limit);
};

export const getOutcomeGoal = (payload: { userId: string; goalId: string }): OutcomeGoal | null => {
  return (
    loadState().goals.find((goal) => goal.userId === payload.userId && goal.id === payload.goalId) ?? null
  );
};

export const listOutcomeCheckIns = (payload: {
  userId: string;
  goalId?: string;
  limit?: number;
}): OutcomeCheckIn[] => {
  const limit = Math.max(1, payload.limit ?? 500);
  return loadState()
    .checkIns
    .filter((checkIn) => checkIn.userId === payload.userId)
    .filter((checkIn) => (payload.goalId ? checkIn.goalId === payload.goalId : true))
    .sort((left, right) => toMs(right.atIso) - toMs(left.atIso))
    .slice(0, limit);
};

export const recordOutcomeCheckIn = (
  payload: RecordOutcomeCheckInInput,
  dependencies: TrackerDependencies = {}
): OutcomeCheckIn | null => {
  const atIso = payload.atIso ?? new Date().toISOString();
  const state = loadState();
  const goal = state.goals.find((entry) => entry.userId === payload.userId && entry.id === payload.goalId);
  if (!goal) return null;

  const metrics = goal.metrics.map((metric) => {
    const nextValue = payload.metricValues[metric.id];
    if (nextValue === undefined) return metric;

    return {
      ...metric,
      currentValue: nextValue,
      updatedAtIso: atIso,
    };
  });

  const updatedGoal: OutcomeGoal = {
    ...goal,
    metrics,
    milestones: goal.milestones.map((milestone) => applyMilestoneStatus(milestone, { ...goal, metrics }, payload.metricValues, atIso)),
    updatedAtIso: atIso,
  };

  const checkIn: OutcomeCheckIn = {
    id: makeId('outcome-checkin'),
    userId: payload.userId,
    goalId: payload.goalId,
    atIso,
    metricValues: {
      ...payload.metricValues,
    },
    note: payload.note,
  };

  saveState({
    goals: [
      updatedGoal,
      ...state.goals.filter((entry) => !(entry.userId === payload.userId && entry.id === payload.goalId)),
    ],
    checkIns: [checkIn, ...state.checkIns],
    updatedAtIso: atIso,
  });

  emitOutcomeActivity(
    {
      userId: payload.userId,
      goalId: payload.goalId,
      eventType: 'outcome.check_in',
      title: 'Outcome check-in logged',
      description: `Logged check-in for ${updatedGoal.title}.`,
      createdAtIso: atIso,
      metadata: {
        metric_count: Object.keys(payload.metricValues).length,
      },
    },
    dependencies
  );

  return checkIn;
};

const summarizeAssessment = (
  goal: OutcomeGoal,
  status: OutcomeAssessmentStatus,
  progressScore: number,
  overdueMilestones: number
): string => {
  const pct = Math.round(progressScore * 100);

  if (status === 'achieved') {
    return `${goal.title} is achieved at ${pct}% progress.`;
  }

  if (status === 'behind') {
    return `${goal.title} is behind pace (${pct}%) with ${overdueMilestones} overdue milestone(s).`;
  }

  if (status === 'at_risk') {
    return `${goal.title} is at risk (${pct}%). Increase check-in cadence and unblock key tasks.`;
  }

  return `${goal.title} is on track at ${pct}% progress.`;
};

export const assessOutcomeGoal = (payload: {
  goal: OutcomeGoal;
  checkIns?: ReadonlyArray<OutcomeCheckIn>;
  nowIso?: string;
}): OutcomeAssessment => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const goal = payload.goal;

  const metricScores = goal.metrics.map((metric) => scoreMetricProgress(metric));
  const metricsScore =
    metricScores.length === 0
      ? 0
      : metricScores.reduce((sum, value) => sum + value, 0) / metricScores.length;

  const milestonesTotal = goal.milestones.length;
  const milestonesCompleted = goal.milestones.filter((milestone) => milestone.status === 'completed').length;
  const overdueMilestones = goal.milestones.filter((milestone) => milestone.status === 'overdue').length;
  const milestoneScore = milestonesTotal === 0 ? metricsScore : milestonesCompleted / milestonesTotal;

  // Milestone completion is the primary indicator for outcome trajectory.
  const progressScore = clamp01(metricsScore * 0.3 + milestoneScore * 0.7);

  let status: OutcomeAssessmentStatus = 'on_track';
  if (goal.status === 'completed' || progressScore >= 0.98) {
    status = 'achieved';
  } else if (overdueMilestones > 0 && progressScore < 0.72) {
    status = 'behind';
  } else if (progressScore < 0.58) {
    status = 'at_risk';
  }

  const nextActions: string[] = [];
  if (status === 'behind') {
    nextActions.push('Rescope next milestone and shorten the check-in loop for this week.');
    nextActions.push('Review blocked dependencies linked to workflows or decisions.');
  } else if (status === 'at_risk') {
    nextActions.push('Add one focused execution block tied to the top metric.');
  } else if (status === 'on_track') {
    nextActions.push('Maintain cadence and pre-plan the next milestone transition.');
  } else {
    nextActions.push('Define the next stretch milestone to preserve momentum.');
  }

  return {
    goalId: goal.id,
    userId: goal.userId,
    generatedAtIso: nowIso,
    status,
    progressScore,
    milestonesCompleted,
    milestonesTotal,
    overdueMilestones,
    summary: summarizeAssessment(goal, status, progressScore, overdueMilestones),
    nextActions,
  };
};

const startOfWeekIso = (iso: string): string => {
  const date = new Date(iso);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const endOfWeekIso = (weekStartIso: string): string => {
  const date = new Date(weekStartIso);
  date.setDate(date.getDate() + 7);
  date.setMilliseconds(-1);
  return date.toISOString();
};

export const buildWeeklyOutcomeScorecard = (payload: {
  userId: string;
  nowIso?: string;
}): OutcomeWeeklyScorecard => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const weekStartIso = startOfWeekIso(nowIso);
  const weekEndIso = endOfWeekIso(weekStartIso);

  const goals = listOutcomeGoals({
    userId: payload.userId,
    statuses: ['active', 'completed'],
    limit: 500,
  });

  const checkIns = listOutcomeCheckIns({ userId: payload.userId, limit: 5000 });
  const checkInsInWindow = checkIns.filter((checkIn) => {
    const time = toMs(checkIn.atIso);
    return time >= toMs(weekStartIso) && time <= toMs(weekEndIso);
  });

  const assessments = goals.map((goal) =>
    assessOutcomeGoal({
      goal,
      checkIns: checkIns.filter((checkIn) => checkIn.goalId === goal.id),
      nowIso,
    })
  );

  const assessmentsByStatus: Record<OutcomeAssessmentStatus, number> = {
    on_track: 0,
    at_risk: 0,
    behind: 0,
    achieved: 0,
  };

  for (const assessment of assessments) {
    assessmentsByStatus[assessment.status] += 1;
  }

  const completedMilestones = goals.reduce(
    (sum, goal) => sum + goal.milestones.filter((milestone) => milestone.status === 'completed').length,
    0
  );
  const totalMilestones = goals.reduce((sum, goal) => sum + goal.milestones.length, 0);

  return {
    userId: payload.userId,
    generatedAtIso: nowIso,
    windowStartIso: weekStartIso,
    windowEndIso: weekEndIso,
    activeOutcomes: goals.filter((goal) => goal.status === 'active').length,
    assessmentsByStatus,
    completedMilestones,
    totalMilestones,
    checkInsLogged: checkInsInWindow.length,
  };
};

export const resetOutcomeStoreForTests = (): void => {
  saveState(emptyState());
};
