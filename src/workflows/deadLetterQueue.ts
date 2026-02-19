import type { StepResult, WorkflowDeadLetterEntry, WorkflowTriggerType } from './types';

interface DeadLetterState {
  entries: WorkflowDeadLetterEntry[];
  updatedAtIso: string;
}

interface DeadLetterStoreAdapter {
  load: (userId: string) => DeadLetterState;
  save: (userId: string, state: DeadLetterState) => void;
}

const STORAGE_PREFIX = 'ashim.workflows.deadletter.v1';
const MAX_ENTRIES = 300;

const emptyState = (): DeadLetterState => ({
  entries: [],
  updatedAtIso: new Date(0).toISOString(),
});

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

const createLocalStorageAdapter = (): DeadLetterStoreAdapter => {
  const memoryFallback = new Map<string, string>();

  const keyFor = (userId: string): string => `${STORAGE_PREFIX}.${userId}`;

  const readRaw = (key: string): string | null => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        // fall through
      }
    }
    return memoryFallback.get(key) ?? null;
  };

  const saveRaw = (key: string, value: string): void => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        // fall through
      }
    }
    memoryFallback.set(key, value);
  };

  return {
    load(userId) {
      const raw = readRaw(keyFor(userId));
      if (!raw) return emptyState();
      try {
        const parsed = JSON.parse(raw) as Partial<DeadLetterState>;
        if (!parsed || !Array.isArray(parsed.entries)) return emptyState();
        return {
          entries: parsed.entries,
          updatedAtIso:
            typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
        };
      } catch {
        return emptyState();
      }
    },
    save(userId, state) {
      saveRaw(keyFor(userId), JSON.stringify(state));
    },
  };
};

export class WorkflowDeadLetterQueue {
  constructor(private readonly adapter: DeadLetterStoreAdapter = createLocalStorageAdapter()) {}

  private update(userId: string, updater: (state: DeadLetterState) => DeadLetterState): DeadLetterState {
    const current = this.adapter.load(userId);
    const next = updater(current);
    const normalized: DeadLetterState = {
      entries: [...next.entries]
        .sort((left, right) => toMs(right.createdAtIso) - toMs(left.createdAtIso))
        .slice(0, MAX_ENTRIES),
      updatedAtIso: new Date().toISOString(),
    };
    this.adapter.save(userId, normalized);
    return normalized;
  }

  append(payload: {
    userId: string;
    workflowId: string;
    triggerType: WorkflowTriggerType;
    reason: string;
    startedAtIso: string;
    finishedAtIso: string;
    stepResults: StepResult[];
  }): WorkflowDeadLetterEntry {
    const nowIso = new Date().toISOString();
    const entry: WorkflowDeadLetterEntry = {
      id: makeId('wf-dlq'),
      userId: payload.userId,
      workflowId: payload.workflowId,
      triggerType: payload.triggerType,
      reason: payload.reason,
      startedAtIso: payload.startedAtIso,
      finishedAtIso: payload.finishedAtIso,
      stepResults: [...payload.stepResults],
      retryCount: 0,
      status: 'pending',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    this.update(payload.userId, (state) => ({
      ...state,
      entries: [entry, ...state.entries.filter((item) => item.id !== entry.id)],
    }));

    return entry;
  }

  list(userId: string, status?: WorkflowDeadLetterEntry['status']): WorkflowDeadLetterEntry[] {
    const entries = this.adapter.load(userId).entries;
    const filtered = status ? entries.filter((entry) => entry.status === status) : entries;
    return [...filtered].sort((left, right) => toMs(right.createdAtIso) - toMs(left.createdAtIso));
  }

  markRetrying(payload: { userId: string; entryId: string }): WorkflowDeadLetterEntry | null {
    let updated: WorkflowDeadLetterEntry | null = null;
    this.update(payload.userId, (state) => ({
      ...state,
      entries: state.entries.map((entry) => {
        if (entry.id !== payload.entryId) return entry;
        updated = {
          ...entry,
          status: 'retrying',
          retryCount: entry.retryCount + 1,
          updatedAtIso: new Date().toISOString(),
        };
        return updated;
      }),
    }));
    return updated;
  }

  markResolved(payload: { userId: string; entryId: string }): WorkflowDeadLetterEntry | null {
    let updated: WorkflowDeadLetterEntry | null = null;
    this.update(payload.userId, (state) => ({
      ...state,
      entries: state.entries.map((entry) => {
        if (entry.id !== payload.entryId) return entry;
        updated = {
          ...entry,
          status: 'resolved',
          updatedAtIso: new Date().toISOString(),
        };
        return updated;
      }),
    }));
    return updated;
  }

  clear(userId: string): void {
    this.adapter.save(userId, emptyState());
  }
}

export const workflowDeadLetterQueue = new WorkflowDeadLetterQueue();

export const createInMemoryDeadLetterAdapter = (): DeadLetterStoreAdapter => {
  const map = new Map<string, DeadLetterState>();
  return {
    load(userId) {
      return map.get(userId) ?? emptyState();
    },
    save(userId, state) {
      map.set(userId, {
        entries: [...state.entries],
        updatedAtIso: state.updatedAtIso,
      });
    },
  };
};
