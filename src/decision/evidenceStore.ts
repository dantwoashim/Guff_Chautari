import type { DecisionEvidence } from './types';

const STORAGE_PREFIX = 'ashim.decision.evidence.v1';

interface DecisionEvidenceStoreState {
  byMatrixId: Record<string, DecisionEvidence[]>;
  updatedAtIso: string;
}

interface DecisionEvidenceStoreAdapter {
  load: (userId: string) => DecisionEvidenceStoreState;
  save: (userId: string, state: DecisionEvidenceStoreState) => void;
}

const emptyState = (): DecisionEvidenceStoreState => ({
  byMatrixId: {},
  updatedAtIso: new Date(0).toISOString(),
});

const isDecisionEvidence = (value: unknown): value is DecisionEvidence => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DecisionEvidence>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.score === 'number' &&
    typeof candidate.timestamp_iso === 'string' &&
    typeof candidate.source_id === 'string' &&
    Array.isArray(candidate.provenance_message_ids)
  );
};

const isValidState = (value: unknown): value is DecisionEvidenceStoreState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DecisionEvidenceStoreState>;
  if (!candidate.byMatrixId || typeof candidate.byMatrixId !== 'object') return false;

  return Object.values(candidate.byMatrixId).every(
    (entry) => Array.isArray(entry) && entry.every((item) => isDecisionEvidence(item))
  );
};

const toMs = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const sortEvidence = (entries: ReadonlyArray<DecisionEvidence>): DecisionEvidence[] => {
  return [...entries].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return toMs(right.timestamp_iso) - toMs(left.timestamp_iso);
  });
};

const createLocalStorageAdapter = (): DecisionEvidenceStoreAdapter => {
  const memoryFallback = new Map<string, string>();

  const storageKey = (userId: string): string => `${STORAGE_PREFIX}.${userId}`;

  const readRaw = (key: string): string | null => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        // Fall through to memory fallback.
      }
    }
    return memoryFallback.get(key) ?? null;
  };

  const writeRaw = (key: string, value: string): void => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        // Fall through to memory fallback.
      }
    }
    memoryFallback.set(key, value);
  };

  return {
    load(userId) {
      const raw = readRaw(storageKey(userId));
      if (!raw) return emptyState();

      try {
        const parsed = JSON.parse(raw);
        if (!isValidState(parsed)) return emptyState();
        return {
          byMatrixId: parsed.byMatrixId,
          updatedAtIso:
            typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
        };
      } catch {
        return emptyState();
      }
    },
    save(userId, state) {
      writeRaw(storageKey(userId), JSON.stringify(state));
    },
  };
};

export class DecisionEvidenceStore {
  constructor(private readonly adapter: DecisionEvidenceStoreAdapter = createLocalStorageAdapter()) {}

  load(userId: string): DecisionEvidenceStoreState {
    return this.adapter.load(userId);
  }

  save(userId: string, state: DecisionEvidenceStoreState): void {
    this.adapter.save(userId, state);
  }

  update(
    userId: string,
    updater: (state: DecisionEvidenceStoreState) => DecisionEvidenceStoreState
  ): DecisionEvidenceStoreState {
    const current = this.load(userId);
    const next = updater(current);
    const normalized: DecisionEvidenceStoreState = {
      ...next,
      byMatrixId: Object.fromEntries(
        Object.entries(next.byMatrixId).map(([matrixId, entries]) => [matrixId, sortEvidence(entries)])
      ),
      updatedAtIso: new Date().toISOString(),
    };
    this.save(userId, normalized);
    return normalized;
  }
}

export const decisionEvidenceStore = new DecisionEvidenceStore();

export const createInMemoryDecisionEvidenceStoreAdapter = (): DecisionEvidenceStoreAdapter => {
  const map = new Map<string, DecisionEvidenceStoreState>();
  return {
    load(userId) {
      return map.get(userId) ?? emptyState();
    },
    save(userId, state) {
      map.set(userId, {
        ...state,
        byMatrixId: Object.fromEntries(
          Object.entries(state.byMatrixId).map(([matrixId, entries]) => [matrixId, [...entries]])
        ),
      });
    },
  };
};

export const appendDecisionEvidence = (
  input: {
    userId: string;
    matrixId: string;
    evidence: DecisionEvidence;
  },
  store: DecisionEvidenceStore = decisionEvidenceStore
): DecisionEvidence => {
  const matrixId = input.matrixId.trim();
  if (!matrixId) {
    throw new Error('matrixId is required.');
  }

  store.update(input.userId, (state) => {
    const existing = state.byMatrixId[matrixId] ?? [];
    const deduped = [...existing.filter((entry) => entry.id !== input.evidence.id), input.evidence];

    return {
      ...state,
      byMatrixId: {
        ...state.byMatrixId,
        [matrixId]: deduped,
      },
    };
  });

  return input.evidence;
};

export const listDecisionEvidence = (
  payload: {
    userId: string;
    matrixId: string;
    limit?: number;
  },
  store: DecisionEvidenceStore = decisionEvidenceStore
): DecisionEvidence[] => {
  const matrixId = payload.matrixId.trim();
  if (!matrixId) return [];

  const limit = Math.max(1, payload.limit ?? 24);
  const state = store.load(payload.userId);
  const entries = state.byMatrixId[matrixId] ?? [];
  return sortEvidence(entries).slice(0, limit);
};

export const clearDecisionEvidence = (
  payload: {
    userId: string;
    matrixId?: string;
  },
  store: DecisionEvidenceStore = decisionEvidenceStore
): void => {
  store.update(payload.userId, (state) => {
    if (payload.matrixId && payload.matrixId.trim().length > 0) {
      const nextByMatrixId = { ...state.byMatrixId };
      delete nextByMatrixId[payload.matrixId.trim()];
      return {
        ...state,
        byMatrixId: nextByMatrixId,
      };
    }

    return {
      ...state,
      byMatrixId: {},
    };
  });
};
