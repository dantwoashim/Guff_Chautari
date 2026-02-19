import type { Message } from '../../types';
import type { DecisionMatrix } from '../decision';
import type { CounterfactualDecisionRecord, CounterfactualEmotionalContext } from './types';

const STORAGE_KEY = 'ashim.counterfactual.decisions.v1';
const MAX_RECORDS = 120;

interface CounterfactualStoreState {
  records: CounterfactualDecisionRecord[];
  updatedAtIso: string;
}

const inMemoryStorage = new Map<string, string>();

const POSITIVE_TERMS = ['good', 'great', 'confident', 'calm', 'progress', 'stable', 'clear'];
const NEGATIVE_TERMS = ['stress', 'risk', 'blocked', 'anxious', 'panic', 'uncertain', 'overwhelmed'];
const HIGH_AROUSAL_TERMS = ['urgent', 'asap', 'immediately', 'now', '!!!'];

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
    .filter((token) => token.length >= 4);

const normalizeTags = (question: string): string[] => [...new Set(tokenize(question))].slice(0, 16);

const scoreMessageValence = (text: string): number => {
  const lowered = text.toLowerCase();
  const positives = POSITIVE_TERMS.reduce((sum, term) => sum + (lowered.includes(term) ? 1 : 0), 0);
  const negatives = NEGATIVE_TERMS.reduce((sum, term) => sum + (lowered.includes(term) ? 1 : 0), 0);
  return clamp(0.5 + (positives - negatives) * 0.1, 0, 1);
};

const scoreMessageArousal = (text: string): number => {
  const lowered = text.toLowerCase();
  const punctuationBoost = Math.min(0.3, (text.match(/[!?]/g)?.length ?? 0) * 0.04);
  const termBoost = HIGH_AROUSAL_TERMS.reduce((sum, term) => sum + (lowered.includes(term) ? 1 : 0), 0) * 0.1;
  return clamp(0.25 + punctuationBoost + termBoost, 0, 1);
};

const deriveEmotionalContext = (messages: ReadonlyArray<Message>): CounterfactualEmotionalContext => {
  if (messages.length === 0) {
    return {
      valence: 0.5,
      arousal: 0.3,
      intensity: 'low',
      summary: 'No recent emotional signal in conversation history.',
    };
  }

  const sample = messages.slice(-18);
  const valence = Number(
    (
      sample.map((message) => scoreMessageValence(message.text)).reduce((sum, value) => sum + value, 0) /
      sample.length
    ).toFixed(3)
  );
  const arousal = Number(
    (
      sample.map((message) => scoreMessageArousal(message.text)).reduce((sum, value) => sum + value, 0) /
      sample.length
    ).toFixed(3)
  );

  const intensityScore = Math.abs(valence - 0.5) + arousal;
  const intensity: CounterfactualEmotionalContext['intensity'] =
    intensityScore >= 0.95 ? 'high' : intensityScore >= 0.6 ? 'medium' : 'low';

  const summary =
    valence >= 0.6
      ? `Positive leaning emotional context (${Math.round(valence * 100)}% valence).`
      : valence <= 0.4
        ? `Negative leaning emotional context (${Math.round(valence * 100)}% valence).`
        : `Neutral emotional context (${Math.round(valence * 100)}% valence).`;

  return {
    valence,
    arousal,
    intensity,
    summary,
  };
};

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

const defaultState = (): CounterfactualStoreState => ({
  records: [],
  updatedAtIso: new Date(0).toISOString(),
});

const isValidRecord = (value: unknown): value is CounterfactualDecisionRecord => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CounterfactualDecisionRecord>;
  return (
    typeof candidate.userId === 'string' &&
    typeof candidate.decisionId === 'string' &&
    typeof candidate.question === 'string' &&
    !!candidate.matrix &&
    typeof candidate.createdAtIso === 'string' &&
    typeof candidate.updatedAtIso === 'string' &&
    Array.isArray(candidate.messages) &&
    Array.isArray(candidate.tags) &&
    !!candidate.emotionalContext
  );
};

const loadState = (): CounterfactualStoreState => {
  const raw = readRaw();
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw) as Partial<CounterfactualStoreState>;
    if (!Array.isArray(parsed.records)) return defaultState();
    const records = parsed.records.filter((record) => isValidRecord(record));
    return {
      records,
      updatedAtIso:
        typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
    };
  } catch {
    return defaultState();
  }
};

const saveState = (state: CounterfactualStoreState): void => {
  writeRaw(
    JSON.stringify({
      records: state.records,
      updatedAtIso: state.updatedAtIso,
    } satisfies CounterfactualStoreState)
  );
};

const toSnapshotMessages = (messages: ReadonlyArray<Message>) => {
  return messages.slice(-24).map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text,
    timestamp: message.timestamp,
  }));
};

const buildDecisionRecord = (payload: {
  userId: string;
  matrix: DecisionMatrix;
  history: ReadonlyArray<Message>;
  nowIso: string;
  threadId?: string;
  selectedOptionId?: string;
  existing?: CounterfactualDecisionRecord;
}): CounterfactualDecisionRecord => {
  const emotionalContext = deriveEmotionalContext(payload.history);
  const tags = normalizeTags(payload.matrix.question);

  return {
    userId: payload.userId,
    decisionId: payload.matrix.id || makeId('decision'),
    question: payload.matrix.question,
    matrix: payload.matrix,
    createdAtIso: payload.existing?.createdAtIso ?? payload.nowIso,
    updatedAtIso: payload.nowIso,
    selectedOptionId: payload.selectedOptionId ?? payload.existing?.selectedOptionId,
    threadId: payload.threadId ?? payload.existing?.threadId,
    tags,
    messages: toSnapshotMessages(payload.history),
    emotionalContext,
  };
};

export const captureCounterfactualDecisionRecord = (payload: {
  userId: string;
  matrix: DecisionMatrix;
  history: ReadonlyArray<Message>;
  nowIso?: string;
  threadId?: string;
  selectedOptionId?: string;
}): CounterfactualDecisionRecord => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const state = loadState();
  const existing = state.records.find(
    (record) => record.userId === payload.userId && record.decisionId === payload.matrix.id
  );

  const next = buildDecisionRecord({
    userId: payload.userId,
    matrix: payload.matrix,
    history: payload.history,
    nowIso,
    threadId: payload.threadId,
    selectedOptionId: payload.selectedOptionId,
    existing,
  });

  const records = [
    next,
    ...state.records.filter(
      (record) => !(record.userId === payload.userId && record.decisionId === next.decisionId)
    ),
  ]
    .sort((left, right) => Date.parse(right.updatedAtIso) - Date.parse(left.updatedAtIso))
    .slice(0, MAX_RECORDS);

  saveState({
    records,
    updatedAtIso: nowIso,
  });

  return next;
};

export const updateCounterfactualDecisionSelection = (payload: {
  userId: string;
  decisionId: string;
  selectedOptionId: string;
  nowIso?: string;
}): CounterfactualDecisionRecord | null => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const state = loadState();
  const target = state.records.find(
    (record) => record.userId === payload.userId && record.decisionId === payload.decisionId
  );
  if (!target) return null;

  const updated: CounterfactualDecisionRecord = {
    ...target,
    selectedOptionId: payload.selectedOptionId,
    updatedAtIso: nowIso,
  };

  const records = [
    updated,
    ...state.records.filter(
      (record) => !(record.userId === payload.userId && record.decisionId === payload.decisionId)
    ),
  ].slice(0, MAX_RECORDS);

  saveState({
    records,
    updatedAtIso: nowIso,
  });

  return updated;
};

export const listCounterfactualDecisionRecords = (payload: {
  userId: string;
  limit?: number;
}): CounterfactualDecisionRecord[] => {
  const limit = Math.max(1, payload.limit ?? 40);
  return loadState()
    .records
    .filter((record) => record.userId === payload.userId)
    .sort((left, right) => Date.parse(right.updatedAtIso) - Date.parse(left.updatedAtIso))
    .slice(0, limit);
};

export const getCounterfactualDecisionRecord = (payload: {
  userId: string;
  decisionId: string;
}): CounterfactualDecisionRecord | null => {
  return (
    loadState().records.find(
      (record) => record.userId === payload.userId && record.decisionId === payload.decisionId
    ) ?? null
  );
};

export const resetCounterfactualStoreForTests = (): void => {
  saveState(defaultState());
};
