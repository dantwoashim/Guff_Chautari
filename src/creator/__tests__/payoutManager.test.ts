import { describe, expect, it } from 'vitest';
import { CreatorPayoutManager } from '../payoutManager';
import { CreatorRevenueShareLedger } from '../revenueShare';

describe('creator payout manager', () => {
  it('credits creator balance and triggers payout at threshold', () => {
    const ledger = new CreatorRevenueShareLedger({
      platformFeeRate: 0.2,
    });
    const payoutManager = new CreatorPayoutManager(ledger);

    ledger.registerPack({
      packId: 'pack-premium-2',
      creatorUserId: 'creator-b',
      model: 'premium',
      unitPriceUsd: 30,
      nowIso: '2026-12-01T00:00:00.000Z',
    });

    const sale = ledger.recordInstallSale({
      packId: 'pack-premium-2',
      buyerUserId: 'buyer-10',
      nowIso: '2026-12-02T00:00:00.000Z',
    });
    expect(sale.platformFeeUsd).toBe(6);
    expect(sale.creatorNetUsd).toBe(24);

    payoutManager.connectCreatorAccount({
      creatorUserId: 'creator-b',
      connectAccountId: 'acct_creator_b',
      taxFormStatus: 'verified',
      nowIso: '2026-12-02T01:00:00.000Z',
    });

    const firstAttempt = payoutManager.createPayoutIfEligible({
      creatorUserId: 'creator-b',
      thresholdUsd: 40,
      nowIso: '2026-12-03T00:00:00.000Z',
    });
    expect(firstAttempt).toBeNull();

    ledger.recordSubscriptionRenewal({
      packId: 'pack-premium-2',
      buyerUserId: 'buyer-10',
      nowIso: '2026-12-10T00:00:00.000Z',
    });

    const payout = payoutManager.createPayoutIfEligible({
      creatorUserId: 'creator-b',
      thresholdUsd: 40,
      nowIso: '2026-12-11T00:00:00.000Z',
    });
    expect(payout).not.toBeNull();
    expect(payout?.amountUsd).toBe(48);
    expect(payout?.status).toBe('paid');

    const summaryAfterPayout = ledger.summarizeCreator({
      creatorUserId: 'creator-b',
      payoutThresholdUsd: 40,
    });
    expect(summaryAfterPayout.payableUsd).toBe(0);
    expect(summaryAfterPayout.settledUsd).toBe(48);
  });
});
