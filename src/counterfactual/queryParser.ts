import { rankDecisionOptions } from '../decision';
import { listCounterfactualDecisionRecords } from './store';
import type {
  CounterfactualDecisionRecord,
  CounterfactualQuery,
  CounterfactualTimeWindow,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

const STOPWORDS = new Set([
  'what',
  'if',
  'had',
  'have',
  'chosen',
  'choose',
  'option',
  'decision',
  'last',
  'week',
  'month',
  'day',
  'the',
  'in',
  'on',
  'for',
  'instead',
  'of',
]);

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
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const overlapScore = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): number => {
  if (left.length === 0 || right.length === 0) return 0;
  const leftSet = new Set(left);
  const overlap = right.filter((token) => leftSet.has(token)).length;
  return overlap / Math.max(1, right.length);
};

const parseTimeWindow = (query: string, nowIso: string): CounterfactualTimeWindow | null => {
  const lowered = query.toLowerCase();
  const nowMs = toMs(nowIso);

  if (lowered.includes('last week')) {
    return {
      label: 'last_week',
      startIso: new Date(nowMs - 14 * DAY_MS).toISOString(),
      endIso: new Date(nowMs - 7 * DAY_MS).toISOString(),
    };
  }

  if (lowered.includes('this week')) {
    return {
      label: 'this_week',
      startIso: new Date(nowMs - 7 * DAY_MS).toISOString(),
      endIso: new Date(nowMs).toISOString(),
    };
  }

  if (lowered.includes('yesterday')) {
    return {
      label: 'yesterday',
      startIso: new Date(nowMs - 2 * DAY_MS).toISOString(),
      endIso: new Date(nowMs - DAY_MS).toISOString(),
    };
  }

  if (lowered.includes('today')) {
    return {
      label: 'today',
      startIso: new Date(nowMs - DAY_MS).toISOString(),
      endIso: new Date(nowMs).toISOString(),
    };
  }

  if (lowered.includes('last month')) {
    return {
      label: 'last_month',
      startIso: new Date(nowMs - 60 * DAY_MS).toISOString(),
      endIso: new Date(nowMs - 30 * DAY_MS).toISOString(),
    };
  }

  return null;
};

const defaultReferenceOptionId = (record: CounterfactualDecisionRecord): string => {
  if (record.selectedOptionId) {
    return record.selectedOptionId;
  }

  const ranking = rankDecisionOptions(record.matrix)[0];
  if (ranking) {
    return ranking.option_id;
  }

  return record.matrix.options[0]?.id ?? '';
};

const resolveAlternativeOptionId = (query: string, record: CounterfactualDecisionRecord, referenceOptionId: string): string => {
  const lowered = query.toLowerCase();

  const optionLetter = lowered.match(/option\s+([a-z])\b/i)?.[1];
  if (optionLetter) {
    const index = optionLetter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
    if (index >= 0 && index < record.matrix.options.length) {
      const candidate = record.matrix.options[index]?.id;
      if (candidate && candidate !== referenceOptionId) {
        return candidate;
      }
    }
  }

  const explicitOptionToken = lowered.match(/option\s+([a-z0-9_-]{2,})/i)?.[1];
  if (explicitOptionToken) {
    const candidate = record.matrix.options.find(
      (option) =>
        option.id.toLowerCase() === explicitOptionToken ||
        option.title.toLowerCase().includes(explicitOptionToken)
    );
    if (candidate && candidate.id !== referenceOptionId) {
      return candidate.id;
    }
  }

  const fallback = record.matrix.options.find((option) => option.id !== referenceOptionId);
  if (fallback) return fallback.id;

  return referenceOptionId;
};

const timeWindowMatchScore = (record: CounterfactualDecisionRecord, timeWindow: CounterfactualTimeWindow | null): number => {
  if (!timeWindow) return 0.2;
  const created = toMs(record.createdAtIso);
  const start = toMs(timeWindow.startIso);
  const end = toMs(timeWindow.endIso);

  if (created >= start && created <= end) return 1;

  const distance = Math.min(Math.abs(created - start), Math.abs(created - end));
  return clamp(1 - distance / (30 * DAY_MS), 0, 0.9);
};

const matchDecisionRecord = (payload: {
  rawQuery: string;
  records: ReadonlyArray<CounterfactualDecisionRecord>;
  preferredDecisionId?: string;
  nowIso: string;
}): { record: CounterfactualDecisionRecord; matchedBy: CounterfactualQuery['matchedBy']; notes: string[]; timeWindow: CounterfactualTimeWindow | null } => {
  if (payload.records.length === 0) {
    throw new Error('No decision records are available yet. Open Decision Room and complete at least one decision.');
  }

  const notes: string[] = [];
  const timeWindow = parseTimeWindow(payload.rawQuery, payload.nowIso);
  if (timeWindow) {
    notes.push(`time_window=${timeWindow.label}`);
  }

  if (payload.preferredDecisionId) {
    const preferred = payload.records.find((record) => record.decisionId === payload.preferredDecisionId);
    if (preferred) {
      notes.push('matched_preferred_decision');
      return {
        record: preferred,
        matchedBy: 'explicit_decision',
        notes,
        timeWindow,
      };
    }
  }

  const explicitDecisionId =
    payload.rawQuery.match(/decision[\s#:_-]*([a-z0-9._-]+)/i)?.[1] ??
    payload.rawQuery.match(/\b([a-z]+-[a-z0-9._-]*decision[a-z0-9._-]*)\b/i)?.[1];

  if (explicitDecisionId) {
    const explicit = payload.records.find((record) => record.decisionId.toLowerCase() === explicitDecisionId.toLowerCase());
    if (explicit) {
      notes.push(`matched_explicit_id=${explicitDecisionId}`);
      return {
        record: explicit,
        matchedBy: 'explicit_decision',
        notes,
        timeWindow,
      };
    }
  }

  const queryTokens = tokenize(payload.rawQuery);

  const scored = payload.records
    .map((record) => {
      const recordTokens = tokenize(`${record.question} ${record.tags.join(' ')}`);
      const topic = overlapScore(queryTokens, recordTokens);
      const temporal = timeWindowMatchScore(record, timeWindow);
      const score = topic * 0.7 + temporal * 0.3;
      return {
        record,
        topic,
        temporal,
        score,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return Date.parse(right.record.updatedAtIso) - Date.parse(left.record.updatedAtIso);
    });

  const top = scored[0];
  if (!top) {
    throw new Error('Unable to resolve decision reference for the query.');
  }

  if (top.topic > 0) {
    notes.push(`topic_overlap=${top.topic.toFixed(3)}`);
    return {
      record: top.record,
      matchedBy: 'topic',
      notes,
      timeWindow,
    };
  }

  notes.push('topic_overlap=0');
  return {
    record: top.record,
    matchedBy: timeWindow ? 'temporal' : 'fallback',
    notes,
    timeWindow,
  };
};

export const parseCounterfactualQuery = (payload: {
  userId: string;
  rawQuery: string;
  nowIso?: string;
  decisionRecords?: ReadonlyArray<CounterfactualDecisionRecord>;
  preferredDecisionId?: string;
}): CounterfactualQuery => {
  const rawQuery = payload.rawQuery.trim();
  if (!rawQuery) {
    throw new Error('Counterfactual query cannot be empty.');
  }

  const nowIso = payload.nowIso ?? new Date().toISOString();
  const records = payload.decisionRecords ?? listCounterfactualDecisionRecords({ userId: payload.userId, limit: 80 });

  const matched = matchDecisionRecord({
    rawQuery,
    records,
    preferredDecisionId: payload.preferredDecisionId,
    nowIso,
  });

  const referenceOptionId = defaultReferenceOptionId(matched.record);
  const alternativeOptionId = resolveAlternativeOptionId(rawQuery, matched.record, referenceOptionId);

  if (!referenceOptionId || !alternativeOptionId) {
    throw new Error('Unable to resolve reference/alternative options for counterfactual query.');
  }

  return {
    id: makeId('counterfactual-query'),
    userId: payload.userId,
    rawQuery,
    decisionId: matched.record.decisionId,
    referenceOptionId,
    alternativeOptionId,
    parsedAtIso: nowIso,
    matchedBy: matched.matchedBy,
    notes: matched.notes,
    timeWindow: matched.timeWindow,
  };
};
