import { describe, expect, it } from 'vitest';
import { MarketplaceStore } from '../../marketplace/store';
import { CreatorPayoutManager } from '../payoutManager';
import { captureCreatorMonetizationState } from '../persistence';
import { CreatorRevenueShareLedger } from '../revenueShare';

describe('creator monetization persistence helpers', () => {
  it('exports creator-scoped snapshots and hydrates without cross-creator bleed', () => {
    const sourceLedger = new CreatorRevenueShareLedger({
      platformFeeRate: 0.2,
    });
    const sourcePayoutManager = new CreatorPayoutManager(sourceLedger);
    const sourceMarketplaceStore = new MarketplaceStore();

    sourceLedger.registerPack({
      packId: 'pack-a',
      creatorUserId: 'creator-a',
      model: 'premium',
      unitPriceUsd: 30,
      nowIso: '2027-04-01T00:00:00.000Z',
    });
    sourceLedger.registerPack({
      packId: 'pack-b',
      creatorUserId: 'creator-b',
      model: 'premium',
      unitPriceUsd: 25,
      nowIso: '2027-04-01T00:00:00.000Z',
    });
    sourceLedger.recordInstallSale({
      packId: 'pack-a',
      buyerUserId: 'buyer-a-1',
      nowIso: '2027-04-02T00:00:00.000Z',
    });
    sourceLedger.recordInstallSale({
      packId: 'pack-b',
      buyerUserId: 'buyer-b-1',
      nowIso: '2027-04-02T00:00:00.000Z',
    });

    sourcePayoutManager.connectCreatorAccount({
      creatorUserId: 'creator-a',
      connectAccountId: 'acct_a',
      taxFormStatus: 'verified',
      nowIso: '2027-04-03T00:00:00.000Z',
    });
    sourcePayoutManager.connectCreatorAccount({
      creatorUserId: 'creator-b',
      connectAccountId: 'acct_b',
      taxFormStatus: 'verified',
      nowIso: '2027-04-03T00:00:00.000Z',
    });
    sourcePayoutManager.createPayoutIfEligible({
      creatorUserId: 'creator-a',
      thresholdUsd: 20,
      nowIso: '2027-04-04T00:00:00.000Z',
    });
    sourceMarketplaceStore.update('creator-a', (state) => ({
      ...state,
      ratings: {
        ...state.ratings,
        'pack-a': { average: 4.9, votes: 40 },
      },
    }));
    sourceMarketplaceStore.update('creator-b', (state) => ({
      ...state,
      ratings: {
        ...state.ratings,
        'pack-b': { average: 3.7, votes: 8 },
      },
    }));

    const scoped = captureCreatorMonetizationState({
      userId: 'creator-a',
      creatorUserId: 'creator-a',
      revenueLedger: sourceLedger,
      payoutManager: sourcePayoutManager,
      marketplace: sourceMarketplaceStore,
    });
    expect(scoped.creatorUserId).toBe('creator-a');
    expect(scoped.revenue.listings.length).toBe(1);
    expect(scoped.revenue.events.every((event) => event.creatorUserId === 'creator-a')).toBe(true);
    expect(scoped.payout.connectAccounts.length).toBe(1);
    expect(scoped.payout.connectAccounts[0].creatorUserId).toBe('creator-a');
    expect(scoped.marketplace?.ratings['pack-a']).toEqual({ average: 4.9, votes: 40 });
    expect(scoped.marketplace?.ratings['pack-b']).toBeUndefined();

    const restoredLedger = new CreatorRevenueShareLedger({
      platformFeeRate: 0.2,
    });
    const restoredPayoutManager = new CreatorPayoutManager(restoredLedger);
    restoredLedger.hydrateState(scoped.revenue);
    restoredPayoutManager.hydrateState(scoped.payout);

    expect(restoredLedger.listPackListings().length).toBe(1);
    expect(restoredLedger.listPackListings()[0].creatorUserId).toBe('creator-a');
    expect(
      restoredLedger.listEvents({
        creatorUserId: 'creator-a',
        includeSettled: true,
      }).length
    ).toBe(1);
    expect(restoredPayoutManager.listConnectAccounts().length).toBe(1);
    expect(restoredPayoutManager.listPayouts('creator-a').length).toBe(1);
    expect(restoredPayoutManager.listPayouts('creator-b').length).toBe(0);
  });

  it('hydrates snapshots idempotently without duplicating events or payouts', () => {
    const sourceLedger = new CreatorRevenueShareLedger({
      platformFeeRate: 0.2,
    });
    const sourcePayoutManager = new CreatorPayoutManager(sourceLedger);

    sourceLedger.registerPack({
      packId: 'pack-main',
      creatorUserId: 'creator-main',
      model: 'premium',
      unitPriceUsd: 40,
      nowIso: '2027-05-01T00:00:00.000Z',
    });
    sourceLedger.recordInstallSale({
      packId: 'pack-main',
      buyerUserId: 'buyer-1',
      nowIso: '2027-05-02T00:00:00.000Z',
    });

    sourcePayoutManager.connectCreatorAccount({
      creatorUserId: 'creator-main',
      connectAccountId: 'acct_main',
      taxFormStatus: 'verified',
      nowIso: '2027-05-03T00:00:00.000Z',
    });
    sourcePayoutManager.createPayoutIfEligible({
      creatorUserId: 'creator-main',
      thresholdUsd: 10,
      nowIso: '2027-05-04T00:00:00.000Z',
    });

    const revenueSnapshot = sourceLedger.exportState();
    const payoutSnapshot = sourcePayoutManager.exportState();

    const restoredLedger = new CreatorRevenueShareLedger({
      platformFeeRate: 0.2,
    });
    const restoredPayoutManager = new CreatorPayoutManager(restoredLedger);

    restoredLedger.hydrateState(revenueSnapshot);
    restoredPayoutManager.hydrateState(payoutSnapshot);
    restoredLedger.hydrateState(revenueSnapshot);
    restoredPayoutManager.hydrateState(payoutSnapshot);

    expect(
      restoredLedger.listEvents({
        creatorUserId: 'creator-main',
        includeSettled: true,
      }).length
    ).toBe(1);
    expect(restoredPayoutManager.listPayouts('creator-main').length).toBe(1);
  });
});
