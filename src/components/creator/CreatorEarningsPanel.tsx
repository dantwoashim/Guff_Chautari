import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { creatorPayoutManager, creatorRevenueLedger } from '../../creator';
import {
  hydrateCreatorMonetizationState,
  persistCreatorMonetizationState,
} from '../../creator/persistence';
import { marketplaceStore } from '../../marketplace';

interface CreatorEarningsPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const asCurrency = (value: number): string => `$${value.toFixed(2)}`;

const sumByDays = (
  values: ReadonlyArray<{ createdAtIso: string; creatorNetUsd: number }>,
  days: number,
  nowMs: number
): number => {
  const windowMs = days * 24 * 60 * 60 * 1000;
  const total = values
    .filter((entry) => nowMs - Date.parse(entry.createdAtIso) <= windowMs)
    .reduce((sum, entry) => sum + entry.creatorNetUsd, 0);
  return Number(total.toFixed(2));
};

const ensureCreatorSeedData = (creatorUserId: string): void => {
  const freePackId = `pack-${creatorUserId}-community`;
  const premiumPackId = `pack-${creatorUserId}-premium`;

  if (!creatorRevenueLedger.getPackListing(freePackId)) {
    creatorRevenueLedger.registerPack({
      packId: freePackId,
      creatorUserId,
      model: 'free',
      title: 'Community Starter Pack',
    });
  }
  if (!creatorRevenueLedger.getPackListing(premiumPackId)) {
    creatorRevenueLedger.registerPack({
      packId: premiumPackId,
      creatorUserId,
      model: 'premium',
      unitPriceUsd: 29,
      title: 'Premium Growth Pack',
    });
  }
  if (!creatorPayoutManager.getConnectAccount(creatorUserId)) {
    creatorPayoutManager.connectCreatorAccount({
      creatorUserId,
      connectAccountId: `acct_${creatorUserId.slice(0, 12)}`,
      taxFormStatus: 'verified',
    });
  }
  const hasHistory =
    creatorRevenueLedger.listEvents({
      creatorUserId,
      includeSettled: true,
    }).length > 0 || creatorPayoutManager.listPayouts(creatorUserId).length > 0;
  if (hasHistory) {
    marketplaceStore.update(creatorUserId, (state) => ({
      ...state,
      ratings: {
        ...state.ratings,
        [freePackId]: state.ratings[freePackId] ?? { average: 4.4, votes: 12 },
        [premiumPackId]: state.ratings[premiumPackId] ?? { average: 4.8, votes: 27 },
      },
    }));
    return;
  }

  creatorRevenueLedger.recordInstallSale({
    packId: freePackId,
    buyerUserId: 'seed-buyer-free',
  });
  creatorRevenueLedger.recordInstallSale({
    packId: premiumPackId,
    buyerUserId: 'seed-buyer-1',
  });
  creatorRevenueLedger.recordSubscriptionRenewal({
    packId: premiumPackId,
    buyerUserId: 'seed-buyer-1',
  });
  creatorRevenueLedger.recordInstallSale({
    packId: premiumPackId,
    buyerUserId: 'seed-buyer-2',
  });
  creatorPayoutManager.runPayoutCycle({
    creatorUserIds: [creatorUserId],
    thresholdUsd: 45,
  });
  creatorRevenueLedger.recordSubscriptionRenewal({
    packId: premiumPackId,
    buyerUserId: 'seed-buyer-1',
  });

  marketplaceStore.update(creatorUserId, (state) => ({
    ...state,
    ratings: {
      ...state.ratings,
      [freePackId]: state.ratings[freePackId] ?? { average: 4.4, votes: 12 },
      [premiumPackId]: state.ratings[premiumPackId] ?? { average: 4.8, votes: 27 },
    },
  }));
};

export const CreatorEarningsPanel: React.FC<CreatorEarningsPanelProps> = ({ userId }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [windowAnchorMs, setWindowAnchorMs] = useState(() => Date.now());
  const [status, setStatus] = useState('');
  const [isHydrating, setIsHydrating] = useState(true);

  const refresh = () => {
    setWindowAnchorMs(Date.now());
    setRefreshTick((tick) => tick + 1);
  };

  const persistState = useCallback(async () => {
    const persisted = await persistCreatorMonetizationState({
      userId,
      creatorUserId: userId,
    });
    return persisted;
  }, [userId]);

  useEffect(() => {
    let active = true;
    setIsHydrating(true);
    setStatus('');

    const bootstrap = async () => {
      await hydrateCreatorMonetizationState({
        userId,
        creatorUserId: userId,
      });
      ensureCreatorSeedData(userId);
      await persistState();

      if (!active) return;
      setWindowAnchorMs(Date.now());
      setRefreshTick((tick) => tick + 1);
      setIsHydrating(false);
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, [persistState, userId]);

  const snapshot = useMemo(() => {
    void refreshTick;

    const listings = creatorRevenueLedger.listPackListings(userId);
    const premiumListing = listings.find((listing) => listing.model === 'premium') ?? null;
    const events = creatorRevenueLedger.listEvents({
      creatorUserId: userId,
      includeSettled: true,
    });
    const summary = creatorRevenueLedger.summarizeCreator({
      creatorUserId: userId,
      payoutThresholdUsd: 50,
    });
    const packPerformance = creatorRevenueLedger.listPackPerformance(userId);
    const payouts = creatorPayoutManager.listPayouts(userId);

    const earningsWindows = {
      daily: sumByDays(events, 1, windowAnchorMs),
      weekly: sumByDays(events, 7, windowAnchorMs),
      monthly: sumByDays(events, 30, windowAnchorMs),
    };

    const ratings = marketplaceStore.load(userId).ratings;
    const taxDocs = creatorPayoutManager.listTaxDocuments({
      creatorUserId: userId,
      taxYear: new Date().getFullYear() - 1,
    });

    return {
      listings,
      premiumListing,
      events,
      summary,
      packPerformance,
      payouts,
      earningsWindows,
      ratings,
      taxDocs,
    };
  }, [refreshTick, userId, windowAnchorMs]);

  const simulateSale = async () => {
    if (!snapshot.premiumListing) {
      setStatus('No premium pack is registered.');
      return;
    }
    const event = creatorRevenueLedger.recordInstallSale({
      packId: snapshot.premiumListing.packId,
      buyerUserId: `buyer-${Date.now()}`,
    });
    await persistState();
    setStatus(`Recorded premium sale (${asCurrency(event.creatorNetUsd)} net).`);
    refresh();
  };

  const simulateRenewal = async () => {
    if (!snapshot.premiumListing) {
      setStatus('No premium pack is registered.');
      return;
    }
    const event = creatorRevenueLedger.recordSubscriptionRenewal({
      packId: snapshot.premiumListing.packId,
      buyerUserId: `renewal-${Date.now()}`,
    });
    await persistState();
    setStatus(`Recorded renewal (${asCurrency(event.creatorNetUsd)} net).`);
    refresh();
  };

  const runPayout = async () => {
    const result = creatorPayoutManager.runPayoutCycle({
      creatorUserIds: [userId],
      thresholdUsd: 50,
    });
    await persistState();
    if (result.payoutsCreated === 0) {
      setStatus('No payout triggered (threshold not reached).');
    } else {
      setStatus(`Payout sent: ${asCurrency(result.payouts[0].amountUsd)}.`);
    }
    refresh();
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className={panelClass}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#e9edef]">Creator Earnings</h2>
              <p className="mt-1 text-sm text-[#8ea1ab]">
                Earnings windows, per-pack monetization performance, payout history, and tax docs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                onClick={() => void simulateSale()}
                disabled={isHydrating}
              >
                Simulate Sale
              </button>
              <button
                type="button"
                className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                onClick={() => void simulateRenewal()}
                disabled={isHydrating}
              >
                Simulate Renewal
              </button>
              <button
                type="button"
                className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                onClick={() => void runPayout()}
                disabled={isHydrating}
              >
                Run Payout
              </button>
              <button
                type="button"
                className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                onClick={refresh}
                disabled={isHydrating}
              >
                Refresh
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <article className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">Daily net</div>
            <div className="mt-1 text-xl text-[#e9edef]">{asCurrency(snapshot.earningsWindows.daily)}</div>
          </article>
          <article className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">Weekly net</div>
            <div className="mt-1 text-xl text-[#e9edef]">{asCurrency(snapshot.earningsWindows.weekly)}</div>
          </article>
          <article className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">Monthly net</div>
            <div className="mt-1 text-xl text-[#e9edef]">{asCurrency(snapshot.earningsWindows.monthly)}</div>
          </article>
          <article className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">Lifetime net</div>
            <div className="mt-1 text-xl text-[#e9edef]">{asCurrency(snapshot.summary.netUsd)}</div>
          </article>
          <article className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">Payable</div>
            <div className="mt-1 text-xl text-[#e9edef]">{asCurrency(snapshot.summary.payableUsd)}</div>
          </article>
        </section>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Per-Pack Performance</h3>
          {snapshot.packPerformance.length === 0 ? (
            <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-xs text-[#8ea1ab]">
              No monetized packs yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left text-[#8ea1ab]">Pack</th>
                    <th className="px-2 py-1 text-left text-[#8ea1ab]">Installs</th>
                    <th className="px-2 py-1 text-left text-[#8ea1ab]">Renewals</th>
                    <th className="px-2 py-1 text-left text-[#8ea1ab]">Refunds</th>
                    <th className="px-2 py-1 text-left text-[#8ea1ab]">Gross</th>
                    <th className="px-2 py-1 text-left text-[#8ea1ab]">Net</th>
                    <th className="px-2 py-1 text-left text-[#8ea1ab]">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.packPerformance.map((row) => {
                    const rating = snapshot.ratings[row.packId];
                    return (
                      <tr key={row.packId}>
                        <td className="px-2 py-1 text-[#dfe7eb]">{row.title ?? row.packId}</td>
                        <td className="px-2 py-1 text-[#9fb0ba]">{row.installs}</td>
                        <td className="px-2 py-1 text-[#9fb0ba]">{row.renewals}</td>
                        <td className="px-2 py-1 text-[#9fb0ba]">{row.refunds}</td>
                        <td className="px-2 py-1 text-[#dfe7eb]">{asCurrency(row.grossUsd)}</td>
                        <td className="px-2 py-1 text-[#dfe7eb]">{asCurrency(row.netUsd)}</td>
                        <td className="px-2 py-1 text-[#9fb0ba]">
                          {rating ? `${rating.average.toFixed(2)} (${rating.votes})` : 'N/A'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Payout History</h3>
            {snapshot.payouts.length === 0 ? (
              <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-xs text-[#8ea1ab]">
                No payouts yet.
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {snapshot.payouts.map((payout) => (
                  <div key={payout.id} className="rounded border border-[#2d3942] bg-[#0d151a] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[#e9edef]">{payout.id}</span>
                      <span className="text-[#7bd0b6]">{asCurrency(payout.amountUsd)}</span>
                    </div>
                    <div className="mt-1 text-[#8ea1ab]">
                      Status: {payout.status} • {new Date(payout.createdAtIso).toLocaleString()}
                    </div>
                    <div className="mt-1 text-[#6f8793]">
                      Source events: {payout.sourceEventIds.length}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Tax Documents</h3>
            <div className="space-y-2 text-xs">
              {snapshot.taxDocs.map((document) => (
                <div key={document.id} className="rounded border border-[#2d3942] bg-[#0d151a] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[#e9edef]">
                      {document.documentType} {document.taxYear}
                    </span>
                    <span className="text-[#8ea1ab]">{document.status}</span>
                  </div>
                  <div className="mt-1 text-[#7f929c]">
                    {document.downloadUrl ? (
                      <a
                        href={document.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#9fd8ee] underline underline-offset-2"
                      >
                        Download document
                      </a>
                    ) : (
                      'Tax document will be available after payout activity.'
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {status ? (
          <div className="rounded border border-[#31596b] bg-[#102531] px-3 py-2 text-xs text-[#b8dbeb]">
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CreatorEarningsPanel;
