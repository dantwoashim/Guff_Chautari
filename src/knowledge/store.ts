import type { KnowledgeGraphState, KnowledgeStoreAdapter } from './types';
import { runtimeKnowledgeStateRepository } from '../data/repositories';
import { isSupabasePersistenceEnabled } from '../runtime/persistenceMode';

const STORAGE_PREFIX = 'ashim.knowledge.v1';

const emptyState = (): KnowledgeGraphState => ({
  sources: [],
  nodes: [],
  edges: [],
  updatedAtIso: new Date(0).toISOString(),
});

const isValidState = (value: unknown): value is KnowledgeGraphState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<KnowledgeGraphState>;
  return Array.isArray(candidate.sources) && Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
};

const parseKnowledgeNamespaceUserId = (
  namespaceUserId: string
): { ownerUserId: string; workspaceId: string; namespaceUserId: string } | null => {
  const match = namespaceUserId.match(/^api:knowledge:([^:]+):(.+)$/);
  if (!match) return null;
  return {
    ownerUserId: match[1],
    workspaceId: match[2],
    namespaceUserId,
  };
};

const createLocalStorageAdapter = (): KnowledgeStoreAdapter => {
  const memoryFallback = new Map<string, string>();

  const getStorageKey = (userId: string): string => `${STORAGE_PREFIX}.${userId}`;

  const loadRaw = (key: string): string | null => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        // Fall back to memory storage.
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
        // Fall back to memory storage.
      }
    }
    memoryFallback.set(key, value);
  };

  return {
    load(userId) {
      const raw = loadRaw(getStorageKey(userId));
      if (!raw) return emptyState();
      try {
        const parsed = JSON.parse(raw);
        if (!isValidState(parsed)) return emptyState();
        return {
          sources: parsed.sources,
          nodes: parsed.nodes,
          edges: parsed.edges,
          updatedAtIso:
            typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
        };
      } catch {
        return emptyState();
      }
    },
    save(userId, state) {
      saveRaw(getStorageKey(userId), JSON.stringify(state));
    },
  };
};

const createSupabaseKnowledgeStoreAdapter = (): KnowledgeStoreAdapter => {
  const localAdapter = createLocalStorageAdapter();
  const cache = new Map<string, KnowledgeGraphState>();
  const hydrated = new Set<string>();

  const hydrateRemote = (namespaceUserId: string): void => {
    if (hydrated.has(namespaceUserId)) return;
    hydrated.add(namespaceUserId);
    const parsed = parseKnowledgeNamespaceUserId(namespaceUserId);
    if (!parsed) return;

    void runtimeKnowledgeStateRepository
      .loadState({
        userId: parsed.ownerUserId,
        workspaceId: parsed.workspaceId,
        namespaceUserId: parsed.namespaceUserId,
      })
      .then((snapshot) => {
        const remoteState = snapshot?.state?.knowledgeState;
        if (!isValidState(remoteState)) return;
        const normalized: KnowledgeGraphState = {
          sources: [...remoteState.sources],
          nodes: [...remoteState.nodes],
          edges: [...remoteState.edges],
          updatedAtIso:
            typeof remoteState.updatedAtIso === 'string'
              ? remoteState.updatedAtIso
              : new Date().toISOString(),
        };
        cache.set(namespaceUserId, normalized);
        localAdapter.save(namespaceUserId, normalized);
      })
      .catch(() => {
        // Keep local state on remote hydration errors.
      });
  };

  const persistRemote = (namespaceUserId: string, state: KnowledgeGraphState): void => {
    const parsed = parseKnowledgeNamespaceUserId(namespaceUserId);
    if (!parsed) return;

    void runtimeKnowledgeStateRepository.saveState({
      userId: parsed.ownerUserId,
      workspaceId: parsed.workspaceId,
      namespaceUserId: parsed.namespaceUserId,
      state: {
        knowledgeState: state,
      },
      schemaVersion: 1,
      version: 1,
    });
  };

  return {
    load(namespaceUserId) {
      const cached = cache.get(namespaceUserId);
      if (cached) return cached;
      const local = localAdapter.load(namespaceUserId);
      cache.set(namespaceUserId, local);
      hydrateRemote(namespaceUserId);
      return local;
    },
    save(namespaceUserId, state) {
      const normalized: KnowledgeGraphState = {
        ...state,
        sources: [...state.sources],
        nodes: [...state.nodes],
        edges: [...state.edges],
      };
      cache.set(namespaceUserId, normalized);
      localAdapter.save(namespaceUserId, normalized);
      persistRemote(namespaceUserId, normalized);
    },
  };
};

export class KnowledgeGraphStore {
  constructor(
    private readonly adapter: KnowledgeStoreAdapter = isSupabasePersistenceEnabled()
      ? createSupabaseKnowledgeStoreAdapter()
      : createLocalStorageAdapter()
  ) {}

  load(userId: string): KnowledgeGraphState {
    return this.adapter.load(userId);
  }

  save(userId: string, state: KnowledgeGraphState): void {
    this.adapter.save(userId, state);
  }

  update(
    userId: string,
    updater: (state: KnowledgeGraphState) => KnowledgeGraphState
  ): KnowledgeGraphState {
    const current = this.load(userId);
    const next = updater(current);
    this.save(userId, {
      ...next,
      updatedAtIso: new Date().toISOString(),
    });
    return next;
  }
}

export const knowledgeGraphStore = new KnowledgeGraphStore();

export const createInMemoryKnowledgeStoreAdapter = (): KnowledgeStoreAdapter => {
  const map = new Map<string, KnowledgeGraphState>();

  return {
    load(userId) {
      return map.get(userId) ?? emptyState();
    },
    save(userId, state) {
      map.set(userId, {
        ...state,
        sources: [...state.sources],
        nodes: [...state.nodes],
        edges: [...state.edges],
      });
    },
  };
};

export const createSupabaseKnowledgeStoreAdapterForRuntime = (): KnowledgeStoreAdapter =>
  createSupabaseKnowledgeStoreAdapter();
