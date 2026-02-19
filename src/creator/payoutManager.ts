import { CreatorRevenueShareLedger, creatorRevenueLedger } from './revenueShare';

const roundMoney = (value: number): number => Number(value.toFixed(2));

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

export interface CreatorConnectAccount {
  creatorUserId: string;
  connectAccountId: string;
  countryCode: string;
  taxFormStatus: 'missing' | 'submitted' | 'verified';
  connectedAtIso: string;
  updatedAtIso: string;
}

export interface CreatorPayoutRecord {
  id: string;
  creatorUserId: string;
  connectAccountId: string;
  amountUsd: number;
  currency: 'USD';
  status: 'pending' | 'paid' | 'failed';
  createdAtIso: string;
  paidAtIso?: string;
  sourceEventIds: string[];
}

export interface CreatorTaxDocumentRecord {
  id: string;
  creatorUserId: string;
  taxYear: number;
  documentType: '1099-NEC';
  status: 'not_ready' | 'ready';
  downloadUrl?: string;
  generatedAtIso?: string;
}

export interface PayoutCycleResult {
  evaluatedCreators: number;
  payoutsCreated: number;
  payouts: CreatorPayoutRecord[];
}

export interface CreatorPayoutManagerSnapshot {
  connectAccounts: CreatorConnectAccount[];
  payouts: CreatorPayoutRecord[];
  capturedAtIso: string;
}

export class CreatorPayoutManager {
  private readonly connectAccounts = new Map<string, CreatorConnectAccount>();
  private readonly payouts: CreatorPayoutRecord[] = [];

  constructor(private readonly ledger: CreatorRevenueShareLedger) {}

  connectCreatorAccount(payload: {
    creatorUserId: string;
    connectAccountId?: string;
    countryCode?: string;
    taxFormStatus?: CreatorConnectAccount['taxFormStatus'];
    nowIso?: string;
  }): CreatorConnectAccount {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const next: CreatorConnectAccount = {
      creatorUserId: payload.creatorUserId,
      connectAccountId:
        payload.connectAccountId ?? `acct_${Math.random().toString(36).slice(2, 12)}`,
      countryCode: (payload.countryCode ?? 'US').toUpperCase(),
      taxFormStatus: payload.taxFormStatus ?? 'submitted',
      connectedAtIso: this.connectAccounts.get(payload.creatorUserId)?.connectedAtIso ?? nowIso,
      updatedAtIso: nowIso,
    };
    this.connectAccounts.set(payload.creatorUserId, next);
    return { ...next };
  }

  getConnectAccount(creatorUserId: string): CreatorConnectAccount | null {
    const account = this.connectAccounts.get(creatorUserId);
    return account ? { ...account } : null;
  }

  listConnectAccounts(): CreatorConnectAccount[] {
    return [...this.connectAccounts.values()]
      .sort((left, right) => left.creatorUserId.localeCompare(right.creatorUserId))
      .map((account) => ({ ...account }));
  }

  listPayouts(creatorUserId?: string): CreatorPayoutRecord[] {
    return this.payouts
      .filter((payout) => (creatorUserId ? payout.creatorUserId === creatorUserId : true))
      .sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso))
      .map((payout) => ({ ...payout, sourceEventIds: [...payout.sourceEventIds] }));
  }

  createPayoutIfEligible(payload: {
    creatorUserId: string;
    thresholdUsd?: number;
    nowIso?: string;
  }): CreatorPayoutRecord | null {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const connectAccount = this.connectAccounts.get(payload.creatorUserId);
    if (!connectAccount) return null;

    const summary = this.ledger.summarizeCreator({
      creatorUserId: payload.creatorUserId,
      payoutThresholdUsd: payload.thresholdUsd,
    });
    if (!summary.qualifiesForPayout || summary.payableUsd <= 0) {
      return null;
    }

    const unsettledEvents = this.ledger
      .listEvents({
        creatorUserId: payload.creatorUserId,
        includeSettled: false,
      })
      .filter((event) => !event.settledPayoutId);
    if (unsettledEvents.length === 0) return null;

    const sourceEventIds = unsettledEvents.map((event) => event.id);
    const payout: CreatorPayoutRecord = {
      id: makeId('payout'),
      creatorUserId: payload.creatorUserId,
      connectAccountId: connectAccount.connectAccountId,
      amountUsd: roundMoney(summary.payableUsd),
      currency: 'USD',
      status: 'paid',
      createdAtIso: nowIso,
      paidAtIso: nowIso,
      sourceEventIds,
    };
    this.payouts.push(payout);

    this.ledger.markEventsSettled({
      creatorUserId: payload.creatorUserId,
      payoutId: payout.id,
      eventIds: sourceEventIds,
    });

    return { ...payout, sourceEventIds: [...payout.sourceEventIds] };
  }

  runPayoutCycle(payload?: {
    creatorUserIds?: string[];
    thresholdUsd?: number;
    nowIso?: string;
  }): PayoutCycleResult {
    const nowIso = payload?.nowIso ?? new Date().toISOString();
    const creatorIds = payload?.creatorUserIds
      ? [...new Set(payload.creatorUserIds)]
      : [
          ...new Set(
            this.ledger
              .listEvents({
                includeSettled: false,
              })
              .map((event) => event.creatorUserId)
          ),
        ];

    const payouts: CreatorPayoutRecord[] = [];
    for (const creatorUserId of creatorIds) {
      const payout = this.createPayoutIfEligible({
        creatorUserId,
        thresholdUsd: payload?.thresholdUsd,
        nowIso,
      });
      if (payout) payouts.push(payout);
    }

    return {
      evaluatedCreators: creatorIds.length,
      payoutsCreated: payouts.length,
      payouts,
    };
  }

  listTaxDocuments(payload: { creatorUserId: string; taxYear: number }): CreatorTaxDocumentRecord[] {
    const summary = this.ledger.summarizeCreator({
      creatorUserId: payload.creatorUserId,
    });
    const ready = summary.netUsd > 0;
    return [
      {
        id: `tax-${payload.creatorUserId}-${payload.taxYear}`,
        creatorUserId: payload.creatorUserId,
        taxYear: payload.taxYear,
        documentType: '1099-NEC',
        status: ready ? 'ready' : 'not_ready',
        downloadUrl: ready
          ? `https://billing.ashim.local/tax/${payload.creatorUserId}/${payload.taxYear}`
          : undefined,
        generatedAtIso: ready ? new Date().toISOString() : undefined,
      },
    ];
  }

  exportState(): CreatorPayoutManagerSnapshot {
    return {
      connectAccounts: [...this.connectAccounts.values()]
        .sort((left, right) => left.creatorUserId.localeCompare(right.creatorUserId))
        .map((account) => ({ ...account })),
      payouts: this.payouts.map((payout) => ({
        ...payout,
        sourceEventIds: [...payout.sourceEventIds],
      })),
      capturedAtIso: new Date().toISOString(),
    };
  }

  exportCreatorState(creatorUserId: string): CreatorPayoutManagerSnapshot {
    const account = this.connectAccounts.get(creatorUserId);
    return {
      connectAccounts: account ? [{ ...account }] : [],
      payouts: this.payouts
        .filter((payout) => payout.creatorUserId === creatorUserId)
        .map((payout) => ({
          ...payout,
          sourceEventIds: [...payout.sourceEventIds],
        })),
      capturedAtIso: new Date().toISOString(),
    };
  }

  hydrateState(snapshot: CreatorPayoutManagerSnapshot): void {
    for (const account of snapshot.connectAccounts ?? []) {
      if (!account?.creatorUserId) continue;
      this.connectAccounts.set(account.creatorUserId, { ...account });
    }

    const byPayoutId = new Map<string, CreatorPayoutRecord>();
    for (const payout of this.payouts) {
      byPayoutId.set(payout.id, {
        ...payout,
        sourceEventIds: [...payout.sourceEventIds],
      });
    }
    for (const payout of snapshot.payouts ?? []) {
      if (!payout?.id) continue;
      byPayoutId.set(payout.id, {
        ...payout,
        sourceEventIds: [...payout.sourceEventIds],
      });
    }
    this.payouts.length = 0;
    this.payouts.push(
      ...[...byPayoutId.values()].sort(
        (left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso)
      )
    );
  }

  resetForTests(): void {
    this.connectAccounts.clear();
    this.payouts.length = 0;
  }
}

export const creatorPayoutManager = new CreatorPayoutManager(creatorRevenueLedger);
