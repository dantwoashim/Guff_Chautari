import { listActivityEvents } from '../activity';
import {
  listCounterfactualDecisionRecords,
} from './store';
import type {
  CounterfactualDecisionRecord,
  FollowThroughDashboardSummary,
  FollowThroughEvaluation,
  FollowThroughNudge,
  FollowThroughStatus,
} from './types';

const STORAGE_KEY = 'ashim.counterfactual.followthrough.v1';

interface FollowThroughStoreState {
  nudges: FollowThroughNudge[];
  updatedAtIso: string;
}

const inMemoryStorage = new Map<string, string>();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .slice(0, 12);

const readRaw = (): string | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Fallback.
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
      // Fallback.
    }
  }
  inMemoryStorage.set(STORAGE_KEY, value);
};

const defaultState = (): FollowThroughStoreState => ({
  nudges: [],
  updatedAtIso: new Date(0).toISOString(),
});

const isValidNudge = (value: unknown): value is FollowThroughNudge => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FollowThroughNudge>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.userId === 'string' &&
    typeof candidate.decisionId === 'string' &&
    typeof candidate.createdAtIso === 'string' &&
    (candidate.level === 'gentle' || candidate.level === 'firm') &&
    typeof candidate.title === 'string' &&
    typeof candidate.message === 'string'
  );
};

const loadState = (): FollowThroughStoreState => {
  const raw = readRaw();
  if (!raw) return defaultState();

  try {
    const parsed = JSON.parse(raw) as Partial<FollowThroughStoreState>;
    if (!Array.isArray(parsed.nudges)) return defaultState();
    return {
      nudges: parsed.nudges.filter((nudge) => isValidNudge(nudge)),
      updatedAtIso:
        typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
    };
  } catch {
    return defaultState();
  }
};

const saveState = (state: FollowThroughStoreState): void => {
  writeRaw(
    JSON.stringify({
      nudges: state.nudges,
      updatedAtIso: state.updatedAtIso,
    } satisfies FollowThroughStoreState)
  );
};

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const sameUtcDay = (leftIso: string, rightIso: string): boolean => {
  const left = new Date(leftIso);
  const right = new Date(rightIso);
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
};

const eventMatchesDecision = (payload: {
  eventType: string;
  title: string;
  description: string;
  decision: CounterfactualDecisionRecord;
}): boolean => {
  if (payload.eventType === 'decision.follow_through') return true;

  const text = `${payload.title} ${payload.description}`.toLowerCase();
  if (text.includes(payload.decision.decisionId.toLowerCase())) return true;

  if (payload.decision.selectedOptionId && text.includes(payload.decision.selectedOptionId.toLowerCase())) {
    return true;
  }

  const questionTokens = tokenize(payload.decision.question);
  const matchedQuestionTerms = questionTokens.filter((token) => text.includes(token)).length;
  if (matchedQuestionTerms >= 2) return true;

  if (payload.eventType.startsWith('workflow.') || payload.eventType.startsWith('knowledge.')) {
    const optionTokens = payload.decision.matrix.options.flatMap((option) => tokenize(option.title));
    const matchedOptionTerms = optionTokens.filter((token) => text.includes(token)).length;
    if (matchedOptionTerms >= 1) return true;
  }

  return false;
};

const evaluateForRecord = (payload: {
  record: CounterfactualDecisionRecord;
  nowIso: string;
  expectedWindowHours: number;
}): FollowThroughEvaluation => {
  const expectedByIso = new Date(toMs(payload.record.createdAtIso) + payload.expectedWindowHours * HOUR_MS).toISOString();

  const relatedEvents = listActivityEvents({
    userId: payload.record.userId,
    filter: {
      dateFromIso: payload.record.createdAtIso,
      dateToIso: payload.nowIso,
    },
    limit: 500,
  }).filter((event) =>
    eventMatchesDecision({
      eventType: event.eventType,
      title: event.title,
      description: event.description,
      decision: payload.record,
    })
  );

  const evidenceCount = relatedEvents.length;
  const lastEvidenceAtIso = relatedEvents[0]?.createdAtIso;
  const nowMs = toMs(payload.nowIso);
  const expectedMs = toMs(expectedByIso);
  const delayHours = (nowMs - expectedMs) / HOUR_MS;

  let status: FollowThroughStatus['status'] = 'on_track';
  if (evidenceCount === 0 && delayHours > 24) {
    status = 'missed';
  } else if (evidenceCount === 0 && nowMs >= expectedMs) {
    status = 'at_risk';
  }

  const statusPayload: FollowThroughStatus = {
    userId: payload.record.userId,
    decisionId: payload.record.decisionId,
    question: payload.record.question,
    selectedOptionId: payload.record.selectedOptionId,
    decisionCreatedAtIso: payload.record.createdAtIso,
    expectedByIso,
    evaluatedAtIso: payload.nowIso,
    status,
    evidenceCount,
    lastEvidenceAtIso,
    daysSinceDecision: Number(clamp((nowMs - toMs(payload.record.createdAtIso)) / DAY_MS, 0, 999).toFixed(2)),
  };

  if (status === 'on_track') {
    return {
      status: statusPayload,
      nudge: null,
    };
  }

  const level: FollowThroughNudge['level'] = status === 'missed' ? 'firm' : 'gentle';
  const nudge: FollowThroughNudge = {
    id: makeId('followthrough-nudge'),
    userId: payload.record.userId,
    decisionId: payload.record.decisionId,
    createdAtIso: payload.nowIso,
    level,
    title: status === 'missed' ? 'Follow-through missed' : 'Follow-through check-in',
    message:
      status === 'missed'
        ? `You have not logged progress on "${payload.record.question}" since ${new Date(payload.record.createdAtIso).toLocaleDateString()}. Pick one concrete next step today.`
        : `No follow-through signal yet for "${payload.record.question}". A small action today keeps the decision alive.`,
  };

  return {
    status: statusPayload,
    nudge,
  };
};

const persistNudgeIfNew = (payload: { nudge: FollowThroughNudge }): FollowThroughNudge | null => {
  const state = loadState();
  const duplicate = state.nudges.some(
    (existing) =>
      existing.userId === payload.nudge.userId &&
      existing.decisionId === payload.nudge.decisionId &&
      sameUtcDay(existing.createdAtIso, payload.nudge.createdAtIso)
  );

  if (duplicate) return null;

  const nudges = [payload.nudge, ...state.nudges]
    .sort((left, right) => toMs(right.createdAtIso) - toMs(left.createdAtIso))
    .slice(0, 200);

  saveState({
    nudges,
    updatedAtIso: payload.nudge.createdAtIso,
  });

  return payload.nudge;
};

export const evaluateDecisionFollowThrough = (payload: {
  userId: string;
  decisionId: string;
  nowIso?: string;
  expectedWindowHours?: number;
  decisionRecords?: ReadonlyArray<CounterfactualDecisionRecord>;
}): FollowThroughEvaluation => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const expectedWindowHours = Math.max(24, payload.expectedWindowHours ?? 48);
  const records =
    payload.decisionRecords ?? listCounterfactualDecisionRecords({ userId: payload.userId, limit: 120 });

  const target = records.find((record) => record.decisionId === payload.decisionId);
  if (!target) {
    throw new Error(`Decision ${payload.decisionId} not found for follow-through evaluation.`);
  }

  return evaluateForRecord({
    record: target,
    nowIso,
    expectedWindowHours,
  });
};

export const runFollowThroughTracker = (payload: {
  userId: string;
  nowIso?: string;
  expectedWindowHours?: number;
  decisionRecords?: ReadonlyArray<CounterfactualDecisionRecord>;
}): {
  statuses: FollowThroughStatus[];
  createdNudges: FollowThroughNudge[];
} => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const expectedWindowHours = Math.max(24, payload.expectedWindowHours ?? 48);
  const records =
    payload.decisionRecords ?? listCounterfactualDecisionRecords({ userId: payload.userId, limit: 120 });

  const statuses: FollowThroughStatus[] = [];
  const createdNudges: FollowThroughNudge[] = [];

  for (const record of records) {
    const evaluation = evaluateForRecord({
      record,
      nowIso,
      expectedWindowHours,
    });
    statuses.push(evaluation.status);

    if (evaluation.nudge) {
      const created = persistNudgeIfNew({ nudge: evaluation.nudge });
      if (created) {
        createdNudges.push(created);
      }
    }
  }

  return {
    statuses,
    createdNudges,
  };
};

export const listFollowThroughNudges = (payload: {
  userId: string;
  limit?: number;
}): FollowThroughNudge[] => {
  const limit = Math.max(1, payload.limit ?? 20);
  return loadState()
    .nudges
    .filter((nudge) => nudge.userId === payload.userId)
    .sort((left, right) => toMs(right.createdAtIso) - toMs(left.createdAtIso))
    .slice(0, limit);
};

export const summarizeFollowThroughDashboard = (payload: {
  userId: string;
  nowIso?: string;
  expectedWindowHours?: number;
  decisionRecords?: ReadonlyArray<CounterfactualDecisionRecord>;
}): FollowThroughDashboardSummary => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const expectedWindowHours = Math.max(24, payload.expectedWindowHours ?? 48);
  const records =
    payload.decisionRecords ?? listCounterfactualDecisionRecords({ userId: payload.userId, limit: 120 });

  const statuses = records.map((record) =>
    evaluateForRecord({
      record,
      nowIso,
      expectedWindowHours,
    }).status
  );

  return {
    generatedAtIso: nowIso,
    totalDecisions: statuses.length,
    onTrack: statuses.filter((status) => status.status === 'on_track').length,
    atRisk: statuses.filter((status) => status.status === 'at_risk').length,
    missed: statuses.filter((status) => status.status === 'missed').length,
    statuses,
    nudges: listFollowThroughNudges({ userId: payload.userId, limit: 8 }),
  };
};

export const resetFollowThroughStoreForTests = (): void => {
  saveState(defaultState());
};
