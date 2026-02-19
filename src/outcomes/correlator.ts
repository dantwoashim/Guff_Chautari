import { listActivityEvents, type ActivityEvent } from '../activity';
import { getOutcomeGoal, listOutcomeCheckIns } from './tracker';
import type {
  OutcomeCorrelationFactor,
  OutcomeCorrelationReport,
  OutcomeGoal,
  OutcomeMetric,
  OutcomeMetricValue,
} from './types';

interface CorrelatorInput {
  userId: string;
  goalId: string;
  nowIso?: string;
  windowDays?: number;
  activityEvents?: ReadonlyArray<ActivityEvent>;
}

interface FactorAccumulator {
  type: OutcomeCorrelationFactor['type'];
  label: string;
  byDay: Map<string, number>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
};

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const startOfDayIso = (iso: string): string => {
  const date = new Date(iso);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const scoreMetricAtCheckIn = (metric: OutcomeMetric, value: OutcomeMetricValue | undefined): number => {
  if (value === undefined || value === null) {
    if (metric.currentValue !== undefined) {
      return scoreMetricAtCheckIn(metric, metric.currentValue);
    }
    return 0;
  }

  if (metric.type === 'binary') {
    return Boolean(value) === Boolean(metric.targetValue) ? 1 : 0;
  }

  if (metric.type === 'qualitative') {
    const normalized = normalize(String(value));
    if (/excellent|great|strong|good|done|complete|healthy/.test(normalized)) return 1;
    if (/okay|ok|partial|moderate|improving/.test(normalized)) return 0.65;
    if (/bad|poor|weak|blocked|behind/.test(normalized)) return 0.25;
    return 0.5;
  }

  const valueNum = Number(value);
  const targetNum = Number(metric.targetValue);
  if (!Number.isFinite(valueNum) || !Number.isFinite(targetNum)) return 0;

  if (metric.direction === 'increase') {
    return clamp01(targetNum === 0 ? 1 : valueNum / targetNum);
  }

  if (metric.direction === 'decrease') {
    if (valueNum <= targetNum) return 1;
    if (targetNum === 0) return 0;
    return clamp01(targetNum / valueNum);
  }

  const denominator = Math.max(1, Math.abs(targetNum));
  return clamp01(1 - Math.abs(valueNum - targetNum) / denominator);
};

const scoreCheckIn = (goal: OutcomeGoal, values: Record<string, OutcomeMetricValue>): number => {
  if (goal.metrics.length === 0) return 0;
  const total = goal.metrics.reduce((sum, metric) => {
    return sum + scoreMetricAtCheckIn(metric, values[metric.id]);
  }, 0);

  return clamp01(total / goal.metrics.length);
};

const pearsonCorrelation = (x: ReadonlyArray<number>, y: ReadonlyArray<number>): number => {
  if (x.length !== y.length || x.length < 2) return 0;

  const xMean = x.reduce((sum, value) => sum + value, 0) / x.length;
  const yMean = y.reduce((sum, value) => sum + value, 0) / y.length;

  let numerator = 0;
  let xSq = 0;
  let ySq = 0;

  for (let index = 0; index < x.length; index += 1) {
    const xDelta = x[index] - xMean;
    const yDelta = y[index] - yMean;
    numerator += xDelta * yDelta;
    xSq += xDelta * xDelta;
    ySq += yDelta * yDelta;
  }

  const denominator = Math.sqrt(xSq) * Math.sqrt(ySq);
  if (denominator === 0) return 0;
  return Number((numerator / denominator).toFixed(4));
};

const factorFromEvent = (
  event: ActivityEvent
): { label: string; type: OutcomeCorrelationFactor['type'] } | null => {
  const text = normalize(`${event.eventType} ${event.title} ${event.description}`);

  if (event.category === 'decision') {
    return {
      label: 'Decision completions',
      type: 'decision',
    };
  }

  if (event.category === 'workflow') {
    if (/deep work|focus block|focus session/.test(text)) {
      return {
        label: 'Deep work blocks',
        type: 'workflow',
      };
    }

    if (/habit|streak/.test(text)) {
      return {
        label: 'Habit streaks',
        type: 'habit',
      };
    }

    return {
      label: 'Workflow completions',
      type: 'workflow',
    };
  }

  if (event.category === 'reflection') {
    return {
      label: 'Emotional stability',
      type: 'emotional',
    };
  }

  return null;
};

const buildProgressDeltas = (goal: OutcomeGoal): Map<string, number> => {
  const checkIns = listOutcomeCheckIns({
    userId: goal.userId,
    goalId: goal.id,
    limit: 2000,
  })
    .sort((left, right) => toMs(left.atIso) - toMs(right.atIso));

  const dayDelta = new Map<string, number>();
  let previousScore = 0;

  for (const checkIn of checkIns) {
    const score = scoreCheckIn(goal, checkIn.metricValues);
    const delta = score - previousScore;
    previousScore = score;

    const day = startOfDayIso(checkIn.atIso);
    dayDelta.set(day, (dayDelta.get(day) ?? 0) + delta);
  }

  return dayDelta;
};

const collectFactors = (events: ReadonlyArray<ActivityEvent>): Map<string, FactorAccumulator> => {
  const factors = new Map<string, FactorAccumulator>();

  for (const event of events) {
    const factor = factorFromEvent(event);
    if (!factor) continue;

    const existing = factors.get(factor.label) ?? {
      type: factor.type,
      label: factor.label,
      byDay: new Map<string, number>(),
    };

    const day = startOfDayIso(event.createdAtIso);
    existing.byDay.set(day, (existing.byDay.get(day) ?? 0) + 1);
    factors.set(factor.label, existing);
  }

  return factors;
};

const correlationConfidence = (correlation: number, sampleSize: number): number => {
  const confidence = 0.42 + Math.abs(correlation) * 0.38 + Math.min(0.2, sampleSize * 0.02);
  return clamp01(confidence);
};

export const generateOutcomeCorrelationReport = (payload: CorrelatorInput): OutcomeCorrelationReport => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const windowDays = Math.max(14, Math.min(180, payload.windowDays ?? 45));
  const windowStartIso = new Date(toMs(nowIso) - windowDays * DAY_MS).toISOString();

  const goal = getOutcomeGoal({ userId: payload.userId, goalId: payload.goalId });
  if (!goal) {
    return {
      goalId: payload.goalId,
      userId: payload.userId,
      generatedAtIso: nowIso,
      factors: [],
      narrative: 'No correlation report available because the outcome goal was not found.',
    };
  }

  const progressDeltaByDay = buildProgressDeltas(goal);

  const events =
    payload.activityEvents ??
    listActivityEvents({
      userId: payload.userId,
      filter: {
        dateFromIso: windowStartIso,
        dateToIso: nowIso,
      },
      limit: 4000,
    });

  const factors = collectFactors(events);

  const reports: OutcomeCorrelationFactor[] = [];
  for (const factor of factors.values()) {
    const dayKeys = new Set<string>([...progressDeltaByDay.keys(), ...factor.byDay.keys()]);
    const sortedDays = Array.from(dayKeys).sort((left, right) => toMs(left) - toMs(right));
    if (sortedDays.length < 3) continue;

    // Use cumulative trajectories so steady daily factors can still correlate with sustained progress.
    const x: number[] = [];
    const y: number[] = [];
    let cumulativeProgress = 0;
    let cumulativeFactor = 0;
    for (const day of sortedDays) {
      cumulativeProgress += progressDeltaByDay.get(day) ?? 0;
      cumulativeFactor += factor.byDay.get(day) ?? 0;
      x.push(cumulativeProgress);
      y.push(cumulativeFactor);
    }
    const correlation = pearsonCorrelation(x, y);
    if (Math.abs(correlation) < 0.05) continue;

    const sampleSize = sortedDays.length;
    reports.push({
      id: `factor-${normalize(factor.label).replace(/\s+/g, '-')}`,
      type: factor.type,
      label: factor.label,
      correlation,
      confidence: correlationConfidence(correlation, sampleSize),
      evidence: `${sampleSize} day sample. Avg factor frequency ${(
        y.reduce((sum, value) => sum + value, 0) / sampleSize
      ).toFixed(2)}.`,
    });
  }

  reports.sort((left, right) => {
    if (Math.abs(right.correlation) !== Math.abs(left.correlation)) {
      return Math.abs(right.correlation) - Math.abs(left.correlation);
    }
    return right.confidence - left.confidence;
  });

  if (reports.length === 0) {
    return {
      goalId: payload.goalId,
      userId: payload.userId,
      generatedAtIso: nowIso,
      factors: [],
      narrative: 'Not enough signal to infer reliable outcome correlations yet.',
    };
  }

  const top = reports[0];
  const narrative =
    top.correlation >= 0
      ? `Strongest contributor appears to be ${top.label} (corr ${top.correlation.toFixed(2)}).`
      : `${top.label} is negatively correlated with progress (corr ${top.correlation.toFixed(2)}).`;

  return {
    goalId: payload.goalId,
    userId: payload.userId,
    generatedAtIso: nowIso,
    factors: reports,
    narrative,
  };
};
