import type { ActivityEvent, ActivityStoreAdapter, ActivityStoreState } from './types';

const STORAGE_PREFIX = 'ashim.activity.v1';
const MAX_EVENTS = 1200;

const emptyState = (): ActivityStoreState => ({
  events: [],
  updatedAtIso: new Date(0).toISOString(),
});

const isValidState = (value: unknown): value is ActivityStoreState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ActivityStoreState>;
  return Array.isArray(candidate.events);
};

const createLocalStorageAdapter = (): ActivityStoreAdapter => {
  const memoryFallback = new Map<string, string>();

  const keyFor = (userId: string): string => `${STORAGE_PREFIX}.${userId}`;

  const loadRaw = (key: string): string | null => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        // Fall through to in-memory fallback.
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
        // Fall through to in-memory fallback.
      }
    }

    memoryFallback.set(key, value);
  };

  return {
    load(userId) {
      const raw = loadRaw(keyFor(userId));
      if (!raw) return emptyState();

      try {
        const parsed = JSON.parse(raw);
        if (!isValidState(parsed)) return emptyState();
        return {
          events: parsed.events,
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

export class ActivityStore {
  constructor(private readonly adapter: ActivityStoreAdapter = createLocalStorageAdapter()) {}

  load(userId: string): ActivityStoreState {
    return this.adapter.load(userId);
  }

  save(userId: string, state: ActivityStoreState): void {
    this.adapter.save(userId, state);
  }

  update(userId: string, updater: (state: ActivityStoreState) => ActivityStoreState): ActivityStoreState {
    const current = this.load(userId);
    const next = updater(current);
    const normalized: ActivityStoreState = {
      ...next,
      events: [...next.events].slice(-MAX_EVENTS),
      updatedAtIso: new Date().toISOString(),
    };

    this.save(userId, normalized);
    return normalized;
  }

  append(userId: string, event: ActivityEvent): ActivityEvent {
    this.update(userId, (state) => ({
      ...state,
      events: [...state.events, event],
    }));

    return event;
  }

  list(userId: string): ActivityEvent[] {
    return this.load(userId).events;
  }
}

export const activityStore = new ActivityStore();

export const createInMemoryActivityStoreAdapter = (): ActivityStoreAdapter => {
  const map = new Map<string, ActivityStoreState>();

  return {
    load(userId) {
      return map.get(userId) ?? emptyState();
    },
    save(userId, state) {
      map.set(userId, {
        ...state,
        events: [...state.events],
      });
    },
  };
};
