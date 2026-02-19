import type { MarketplaceState } from './types';

const STORAGE_PREFIX = 'ashim.marketplace.v1';

const memoryFallback = new Map<string, string>();

const keyForUser = (userId: string): string => `${STORAGE_PREFIX}.${userId}`;

const defaultState = (): MarketplaceState => ({
  installedTemplateIds: [],
  submissions: [],
  ratings: {},
  templateStats: {},
  reviewsByTemplateId: {},
  updatedAtIso: new Date(0).toISOString(),
});

const readRaw = (key: string): string | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Use memory fallback.
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
      // Use memory fallback.
    }
  }
  memoryFallback.set(key, value);
};

const isValidState = (value: unknown): value is MarketplaceState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MarketplaceState>;
  return (
    Array.isArray(candidate.installedTemplateIds) &&
    Array.isArray(candidate.submissions) &&
    typeof candidate.ratings === 'object' &&
    candidate.ratings !== null &&
    typeof candidate.templateStats === 'object' &&
    candidate.templateStats !== null
  );
};

export class MarketplaceStore {
  load(userId: string): MarketplaceState {
    const raw = readRaw(keyForUser(userId));
    if (!raw) return defaultState();

    try {
      const parsed = JSON.parse(raw);
      if (!isValidState(parsed)) return defaultState();
      return {
        installedTemplateIds: [...parsed.installedTemplateIds],
        submissions: [...parsed.submissions],
        ratings: { ...parsed.ratings },
        templateStats: { ...parsed.templateStats },
        reviewsByTemplateId: { ...(parsed.reviewsByTemplateId ?? {}) },
        updatedAtIso:
          typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
      };
    } catch {
      return defaultState();
    }
  }

  save(userId: string, state: MarketplaceState): void {
    writeRaw(
      keyForUser(userId),
      JSON.stringify({
        ...state,
        updatedAtIso: new Date().toISOString(),
      } satisfies MarketplaceState)
    );
  }

  update(userId: string, updater: (state: MarketplaceState) => MarketplaceState): MarketplaceState {
    const current = this.load(userId);
    const next = updater(current);
    const normalized: MarketplaceState = {
      installedTemplateIds: [...next.installedTemplateIds],
      submissions: [...next.submissions],
      ratings: { ...next.ratings },
      templateStats: { ...next.templateStats },
      reviewsByTemplateId: { ...next.reviewsByTemplateId },
      updatedAtIso: new Date().toISOString(),
    };
    this.save(userId, normalized);
    return normalized;
  }
}

export const marketplaceStore = new MarketplaceStore();
