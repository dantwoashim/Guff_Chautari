import type { CouncilStoreAdapter, CouncilStoreState } from './types';

const STORAGE_PREFIX = 'ashim.council.v1';

const emptyState = (): CouncilStoreState => ({
  councils: [],
  updatedAtIso: new Date(0).toISOString(),
});

const isValidState = (value: unknown): value is CouncilStoreState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CouncilStoreState>;
  return Array.isArray(candidate.councils);
};

const createLocalStorageAdapter = (): CouncilStoreAdapter => {
  const memoryFallback = new Map<string, string>();

  const storageKey = (userId: string): string => `${STORAGE_PREFIX}.${userId}`;

  const loadRaw = (key: string): string | null => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        // Fall through to memory fallback.
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
        // Fall through to memory fallback.
      }
    }
    memoryFallback.set(key, value);
  };

  return {
    load(userId) {
      const raw = loadRaw(storageKey(userId));
      if (!raw) return emptyState();

      try {
        const parsed = JSON.parse(raw);
        if (!isValidState(parsed)) return emptyState();
        return {
          councils: parsed.councils,
          updatedAtIso:
            typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
        };
      } catch {
        return emptyState();
      }
    },
    save(userId, state) {
      saveRaw(storageKey(userId), JSON.stringify(state));
    },
  };
};

export class CouncilStore {
  constructor(private readonly adapter: CouncilStoreAdapter = createLocalStorageAdapter()) {}

  load(userId: string): CouncilStoreState {
    return this.adapter.load(userId);
  }

  save(userId: string, state: CouncilStoreState): void {
    this.adapter.save(userId, state);
  }

  update(userId: string, updater: (state: CouncilStoreState) => CouncilStoreState): CouncilStoreState {
    const current = this.load(userId);
    const next = updater(current);
    const normalized: CouncilStoreState = {
      ...next,
      councils: [...next.councils],
      updatedAtIso: new Date().toISOString(),
    };
    this.save(userId, normalized);
    return normalized;
  }
}

export const councilStore = new CouncilStore();

export const createInMemoryCouncilStoreAdapter = (): CouncilStoreAdapter => {
  const map = new Map<string, CouncilStoreState>();
  return {
    load(userId) {
      return map.get(userId) ?? emptyState();
    },
    save(userId, state) {
      map.set(userId, {
        ...state,
        councils: [...state.councils],
      });
    },
  };
};
