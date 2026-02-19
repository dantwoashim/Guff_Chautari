export interface GeminiContextCacheEntry {
  cacheId: string;
  personaId: string;
  sessionId: string;
  coreHash: string;
  createdAt: number;
  lastUsedAt: number;
  hits: number;
}

export interface GeminiCacheLookupResult {
  entry: GeminiContextCacheEntry;
  reused: boolean;
}

interface GeminiContextCacheOptions {
  now?: () => number;
}

const hashCore = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return Math.abs(hash >>> 0).toString(16);
};

const makeKey = (personaId: string, sessionId: string, coreHash: string): string => {
  return `${personaId}:${sessionId}:${coreHash}`;
};

export class GeminiContextCache {
  private readonly entries = new Map<string, GeminiContextCacheEntry>();
  private readonly now: () => number;

  constructor(options: GeminiContextCacheOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  getOrCreate(params: {
    personaId: string;
    sessionId?: string;
    immutableCore: string;
  }): GeminiCacheLookupResult {
    const now = this.now();
    const coreHash = hashCore(params.immutableCore.trim());
    const sessionId = params.sessionId ?? 'default-session';
    const key = makeKey(params.personaId, sessionId, coreHash);
    const existing = this.entries.get(key);

    if (existing) {
      const updated: GeminiContextCacheEntry = {
        ...existing,
        lastUsedAt: now,
        hits: existing.hits + 1,
      };
      this.entries.set(key, updated);
      return { entry: updated, reused: true };
    }

    const cacheId = `gcache_${params.personaId}_${coreHash}_${now.toString(36)}`;
    const created: GeminiContextCacheEntry = {
      cacheId,
      personaId: params.personaId,
      sessionId,
      coreHash,
      createdAt: now,
      lastUsedAt: now,
      hits: 1,
    };

    this.entries.set(key, created);

    return {
      entry: created,
      reused: false,
    };
  }

  getByCacheId(cacheId: string): GeminiContextCacheEntry | null {
    for (const entry of this.entries.values()) {
      if (entry.cacheId === cacheId) {
        return entry;
      }
    }
    return null;
  }

  size(): number {
    return this.entries.size;
  }
}

export const geminiContextCache = new GeminiContextCache();
