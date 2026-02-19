import { runtimeBillingRepository } from '../data/repositories';
import { marketplaceStore, type MarketplaceStore } from '../marketplace/store';
import type { MarketplaceState } from '../marketplace/types';
import { isSupabasePersistenceEnabled } from '../runtime/persistenceMode';
import {
  creatorPayoutManager,
  type CreatorPayoutManager,
  type CreatorPayoutManagerSnapshot,
} from './payoutManager';
import {
  creatorRevenueLedger,
  type CreatorRevenueShareLedger,
  type CreatorRevenueShareSnapshot,
} from './revenueShare';

const CREATOR_MONETIZATION_SCOPE_TYPE = 'creator_monetization';
const CREATOR_MONETIZATION_SCHEMA_VERSION = 1;
const CREATOR_MONETIZATION_VERSION = 1;

const hydratedCreatorScopes = new Set<string>();

export interface PersistedCreatorMonetizationState {
  creatorUserId: string;
  revenue: CreatorRevenueShareSnapshot;
  payout: CreatorPayoutManagerSnapshot;
  marketplace?: MarketplaceState;
  capturedAtIso: string;
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const isMarketplaceState = (value: unknown): value is MarketplaceState => {
  const candidate = asRecord(value);
  if (!candidate) return false;
  return (
    Array.isArray(candidate.installedTemplateIds) &&
    Array.isArray(candidate.submissions) &&
    typeof candidate.ratings === 'object' &&
    candidate.ratings !== null &&
    typeof candidate.templateStats === 'object' &&
    candidate.templateStats !== null &&
    typeof candidate.reviewsByTemplateId === 'object' &&
    candidate.reviewsByTemplateId !== null
  );
};

const isPersistedCreatorMonetizationState = (
  value: unknown
): value is PersistedCreatorMonetizationState => {
  const candidate = asRecord(value);
  if (!candidate) return false;
  if (typeof candidate.creatorUserId !== 'string' || candidate.creatorUserId.trim().length === 0) {
    return false;
  }
  const revenue = asRecord(candidate.revenue);
  const payout = asRecord(candidate.payout);
  if (!revenue || !payout) return false;
  if (!Array.isArray(revenue.listings) || !Array.isArray(revenue.events)) return false;
  if (!Array.isArray(payout.connectAccounts) || !Array.isArray(payout.payouts)) return false;
  if (candidate.marketplace !== undefined && !isMarketplaceState(candidate.marketplace)) return false;
  return true;
};

const hydrationKey = (userId: string, creatorUserId: string): string => `${userId}::${creatorUserId}`;

const normalizeCreatorUserId = (payload: { userId: string; creatorUserId?: string }): string => {
  const candidate = payload.creatorUserId?.trim();
  if (candidate && candidate.length > 0) return candidate;
  return payload.userId.trim();
};

const extractPersistedState = (
  payload: Record<string, unknown>
): PersistedCreatorMonetizationState | null => {
  const nested = payload.creator;
  if (isPersistedCreatorMonetizationState(nested)) return nested;
  if (isPersistedCreatorMonetizationState(payload)) return payload;
  return null;
};

export const captureCreatorMonetizationState = (payload: {
  userId: string;
  creatorUserId?: string;
  revenueLedger?: CreatorRevenueShareLedger;
  payoutManager?: CreatorPayoutManager;
  marketplace?: MarketplaceStore;
}): PersistedCreatorMonetizationState => {
  const creatorUserId = normalizeCreatorUserId(payload);
  const revenueLedger = payload.revenueLedger ?? creatorRevenueLedger;
  const payoutManager = payload.payoutManager ?? creatorPayoutManager;
  const marketplace = payload.marketplace ?? marketplaceStore;
  return {
    creatorUserId,
    revenue: revenueLedger.exportCreatorState(creatorUserId),
    payout: payoutManager.exportCreatorState(creatorUserId),
    marketplace: marketplace.load(creatorUserId),
    capturedAtIso: new Date().toISOString(),
  };
};

export const hydrateCreatorMonetizationState = async (payload: {
  userId: string;
  creatorUserId?: string;
  revenueLedger?: CreatorRevenueShareLedger;
  payoutManager?: CreatorPayoutManager;
  marketplace?: MarketplaceStore;
}): Promise<boolean> => {
  if (!isSupabasePersistenceEnabled()) return false;
  const userId = payload.userId.trim();
  if (!userId) return false;
  const creatorUserId = normalizeCreatorUserId(payload);
  if (!creatorUserId) return false;

  const key = hydrationKey(userId, creatorUserId);
  if (hydratedCreatorScopes.has(key)) return false;
  hydratedCreatorScopes.add(key);

  try {
    const row = await runtimeBillingRepository.loadState({
      userId,
      scopeType: CREATOR_MONETIZATION_SCOPE_TYPE,
      scopeId: creatorUserId,
    });
    if (!row) return false;
    const payloadRecord = asRecord(row.payload);
    if (!payloadRecord) return false;
    const state = extractPersistedState(payloadRecord);
    if (!state) return false;

    const revenueLedger = payload.revenueLedger ?? creatorRevenueLedger;
    const payoutManager = payload.payoutManager ?? creatorPayoutManager;
    const marketplace = payload.marketplace ?? marketplaceStore;
    revenueLedger.hydrateState(state.revenue);
    payoutManager.hydrateState(state.payout);
    if (state.marketplace) {
      marketplace.save(creatorUserId, state.marketplace);
    }
    return true;
  } catch {
    return false;
  }
};

export const persistCreatorMonetizationState = async (payload: {
  userId: string;
  creatorUserId?: string;
  revenueLedger?: CreatorRevenueShareLedger;
  payoutManager?: CreatorPayoutManager;
  marketplace?: MarketplaceStore;
}): Promise<boolean> => {
  if (!isSupabasePersistenceEnabled()) return false;
  const userId = payload.userId.trim();
  if (!userId) return false;
  const creatorUserId = normalizeCreatorUserId(payload);
  if (!creatorUserId) return false;

  const state = captureCreatorMonetizationState(payload);
  try {
    await runtimeBillingRepository.saveState({
      userId,
      scopeType: CREATOR_MONETIZATION_SCOPE_TYPE,
      scopeId: creatorUserId,
      state: {
        creator: state,
      },
      schemaVersion: CREATOR_MONETIZATION_SCHEMA_VERSION,
      version: CREATOR_MONETIZATION_VERSION,
    });
    return true;
  } catch {
    return false;
  }
};

export const resetCreatorMonetizationHydrationForTests = (): void => {
  hydratedCreatorScopes.clear();
};
