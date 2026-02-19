import { describe, expect, it } from 'vitest';
import { CreatorRevenueShareLedger } from '../revenueShare';

describe('creator revenue share ledger', () => {
  it('splits premium pack sales with 20% platform fee and no revenue for free packs', () => {
    const ledger = new CreatorRevenueShareLedger({
      platformFeeRate: 0.2,
      defaultPayoutThresholdUsd: 50,
    });

    ledger.registerPack({
      packId: 'pack-free-1',
      creatorUserId: 'creator-a',
      model: 'free',
      title: 'Community Pack',
      nowIso: '2026-12-05T00:00:00.000Z',
    });
    ledger.registerPack({
      packId: 'pack-premium-1',
      creatorUserId: 'creator-a',
      model: 'premium',
      unitPriceUsd: 25,
      title: 'Premium Pack',
      nowIso: '2026-12-05T00:00:00.000Z',
    });

    const freeSale = ledger.recordInstallSale({
      packId: 'pack-free-1',
      buyerUserId: 'buyer-1',
      nowIso: '2026-12-06T00:00:00.000Z',
    });
    expect(freeSale.grossUsd).toBe(0);
    expect(freeSale.creatorNetUsd).toBe(0);

    const premiumSale = ledger.recordInstallSale({
      packId: 'pack-premium-1',
      buyerUserId: 'buyer-2',
      nowIso: '2026-12-06T00:01:00.000Z',
    });
    expect(premiumSale.grossUsd).toBe(25);
    expect(premiumSale.platformFeeUsd).toBe(5);
    expect(premiumSale.creatorNetUsd).toBe(20);

    const renewal = ledger.recordSubscriptionRenewal({
      packId: 'pack-premium-1',
      buyerUserId: 'buyer-2',
      nowIso: '2026-12-20T00:01:00.000Z',
    });
    expect(renewal.creatorNetUsd).toBe(20);

    const summary = ledger.summarizeCreator({
      creatorUserId: 'creator-a',
      payoutThresholdUsd: 30,
    });
    expect(summary.grossUsd).toBe(50);
    expect(summary.platformFeeUsd).toBe(10);
    expect(summary.payableUsd).toBe(40);
    expect(summary.qualifiesForPayout).toBe(true);
  });
});
