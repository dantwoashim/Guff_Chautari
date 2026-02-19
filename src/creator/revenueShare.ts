const DEFAULT_PLATFORM_FEE_RATE = 0.2;
const DEFAULT_PAYOUT_THRESHOLD_USD = 100;

const roundMoney = (value: number): number => Number(value.toFixed(2));

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

export type CreatorPackMonetizationModel = 'free' | 'premium';

export type CreatorRevenueEventType = 'install_purchase' | 'subscription_renewal' | 'refund';

export interface CreatorPackRevenueListing {
  packId: string;
  creatorUserId: string;
  model: CreatorPackMonetizationModel;
  unitPriceUsd: number;
  title?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CreatorRevenueEvent {
  id: string;
  packId: string;
  creatorUserId: string;
  buyerUserId?: string;
  eventType: CreatorRevenueEventType;
  quantity: number;
  unitPriceUsd: number;
  grossUsd: number;
  platformFeeUsd: number;
  creatorNetUsd: number;
  currency: 'USD';
  createdAtIso: string;
  settledPayoutId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface CreatorRevenueSummary {
  creatorUserId: string;
  grossUsd: number;
  platformFeeUsd: number;
  netUsd: number;
  settledUsd: number;
  payableUsd: number;
  payoutThresholdUsd: number;
  qualifiesForPayout: boolean;
}

export interface CreatorPackPerformanceRow {
  packId: string;
  title?: string;
  installs: number;
  renewals: number;
  refunds: number;
  grossUsd: number;
  netUsd: number;
  averageUnitPriceUsd: number;
}

export interface CreatorRevenueShareSnapshot {
  listings: CreatorPackRevenueListing[];
  events: CreatorRevenueEvent[];
  capturedAtIso: string;
}

export class CreatorRevenueShareLedger {
  private readonly listingsByPackId = new Map<string, CreatorPackRevenueListing>();
  private readonly events: CreatorRevenueEvent[] = [];

  constructor(
    private readonly config: {
      platformFeeRate?: number;
      defaultPayoutThresholdUsd?: number;
    } = {}
  ) {}

  get platformFeeRate(): number {
    const rate = this.config.platformFeeRate ?? DEFAULT_PLATFORM_FEE_RATE;
    return Math.max(0, Math.min(rate, 0.95));
  }

  get defaultPayoutThresholdUsd(): number {
    const threshold = this.config.defaultPayoutThresholdUsd ?? DEFAULT_PAYOUT_THRESHOLD_USD;
    return Math.max(1, threshold);
  }

  registerPack(payload: {
    packId: string;
    creatorUserId: string;
    model: CreatorPackMonetizationModel;
    unitPriceUsd?: number;
    title?: string;
    nowIso?: string;
  }): CreatorPackRevenueListing {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const unitPriceUsd =
      payload.model === 'premium' ? Math.max(0, payload.unitPriceUsd ?? 0) : 0;

    const next: CreatorPackRevenueListing = {
      packId: payload.packId,
      creatorUserId: payload.creatorUserId,
      model: payload.model,
      unitPriceUsd: roundMoney(unitPriceUsd),
      title: payload.title,
      createdAtIso: this.listingsByPackId.get(payload.packId)?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso,
    };
    this.listingsByPackId.set(next.packId, next);
    return { ...next };
  }

  getPackListing(packId: string): CreatorPackRevenueListing | null {
    const listing = this.listingsByPackId.get(packId);
    return listing ? { ...listing } : null;
  }

  listPackListings(creatorUserId?: string): CreatorPackRevenueListing[] {
    return [...this.listingsByPackId.values()]
      .filter((listing) => (creatorUserId ? listing.creatorUserId === creatorUserId : true))
      .sort((left, right) => left.packId.localeCompare(right.packId))
      .map((listing) => ({ ...listing }));
  }

  recordInstallSale(payload: {
    packId: string;
    buyerUserId?: string;
    quantity?: number;
    unitPriceUsd?: number;
    nowIso?: string;
  }): CreatorRevenueEvent {
    return this.recordRevenueEvent({
      packId: payload.packId,
      buyerUserId: payload.buyerUserId,
      quantity: payload.quantity,
      unitPriceUsd: payload.unitPriceUsd,
      eventType: 'install_purchase',
      nowIso: payload.nowIso,
    });
  }

  recordSubscriptionRenewal(payload: {
    packId: string;
    buyerUserId?: string;
    quantity?: number;
    unitPriceUsd?: number;
    nowIso?: string;
  }): CreatorRevenueEvent {
    return this.recordRevenueEvent({
      packId: payload.packId,
      buyerUserId: payload.buyerUserId,
      quantity: payload.quantity,
      unitPriceUsd: payload.unitPriceUsd,
      eventType: 'subscription_renewal',
      nowIso: payload.nowIso,
    });
  }

  recordRefund(payload: {
    packId: string;
    buyerUserId?: string;
    amountUsd?: number;
    referenceEventId?: string;
    nowIso?: string;
  }): CreatorRevenueEvent {
    const listing = this.requirePackListing(payload.packId);
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const amountUsd = Math.max(0, payload.amountUsd ?? listing.unitPriceUsd);
    const split = this.calculateSplit(-amountUsd);
    const event: CreatorRevenueEvent = {
      id: makeId('rev'),
      packId: listing.packId,
      creatorUserId: listing.creatorUserId,
      buyerUserId: payload.buyerUserId,
      eventType: 'refund',
      quantity: 1,
      unitPriceUsd: roundMoney(amountUsd),
      grossUsd: split.grossUsd,
      platformFeeUsd: split.platformFeeUsd,
      creatorNetUsd: split.creatorNetUsd,
      currency: 'USD',
      createdAtIso: nowIso,
      metadata: {
        referenceEventId: payload.referenceEventId ?? null,
      },
    };
    this.events.push(event);
    return { ...event };
  }

  listEvents(filters?: {
    creatorUserId?: string;
    packId?: string;
    includeSettled?: boolean;
  }): CreatorRevenueEvent[] {
    return this.events
      .filter((event) => (filters?.creatorUserId ? event.creatorUserId === filters.creatorUserId : true))
      .filter((event) => (filters?.packId ? event.packId === filters.packId : true))
      .filter((event) => (filters?.includeSettled ? true : !event.settledPayoutId))
      .sort((left, right) => Date.parse(left.createdAtIso) - Date.parse(right.createdAtIso))
      .map((event) => ({ ...event }));
  }

  summarizeCreator(payload: {
    creatorUserId: string;
    payoutThresholdUsd?: number;
  }): CreatorRevenueSummary {
    const events = this.events.filter((event) => event.creatorUserId === payload.creatorUserId);
    const grossUsd = roundMoney(events.reduce((sum, event) => sum + event.grossUsd, 0));
    const platformFeeUsd = roundMoney(events.reduce((sum, event) => sum + event.platformFeeUsd, 0));
    const netUsd = roundMoney(events.reduce((sum, event) => sum + event.creatorNetUsd, 0));
    const settledUsd = roundMoney(
      events
        .filter((event) => Boolean(event.settledPayoutId))
        .reduce((sum, event) => sum + event.creatorNetUsd, 0)
    );
    const payableUsd = roundMoney(
      events
        .filter((event) => !event.settledPayoutId)
        .reduce((sum, event) => sum + event.creatorNetUsd, 0)
    );
    const payoutThresholdUsd = Math.max(1, payload.payoutThresholdUsd ?? this.defaultPayoutThresholdUsd);
    return {
      creatorUserId: payload.creatorUserId,
      grossUsd,
      platformFeeUsd,
      netUsd,
      settledUsd,
      payableUsd,
      payoutThresholdUsd,
      qualifiesForPayout: payableUsd >= payoutThresholdUsd,
    };
  }

  listPackPerformance(creatorUserId: string): CreatorPackPerformanceRow[] {
    const rows = new Map<string, CreatorPackPerformanceRow>();
    const listingRows = this.listPackListings(creatorUserId);

    for (const listing of listingRows) {
      rows.set(listing.packId, {
        packId: listing.packId,
        title: listing.title,
        installs: 0,
        renewals: 0,
        refunds: 0,
        grossUsd: 0,
        netUsd: 0,
        averageUnitPriceUsd: listing.unitPriceUsd,
      });
    }

    for (const event of this.events.filter((entry) => entry.creatorUserId === creatorUserId)) {
      const existing = rows.get(event.packId) ?? {
        packId: event.packId,
        installs: 0,
        renewals: 0,
        refunds: 0,
        grossUsd: 0,
        netUsd: 0,
        averageUnitPriceUsd: event.unitPriceUsd,
      };
      existing.grossUsd = roundMoney(existing.grossUsd + event.grossUsd);
      existing.netUsd = roundMoney(existing.netUsd + event.creatorNetUsd);
      if (event.eventType === 'install_purchase') existing.installs += event.quantity;
      if (event.eventType === 'subscription_renewal') existing.renewals += event.quantity;
      if (event.eventType === 'refund') existing.refunds += event.quantity;
      rows.set(event.packId, existing);
    }

    for (const [packId, row] of rows.entries()) {
      const paidEvents = this.events.filter(
        (event) =>
          event.creatorUserId === creatorUserId &&
          event.packId === packId &&
          (event.eventType === 'install_purchase' || event.eventType === 'subscription_renewal')
      );
      const paidUnits = paidEvents.reduce((sum, event) => sum + event.quantity, 0);
      const paidGross = paidEvents.reduce((sum, event) => sum + event.grossUsd, 0);
      row.averageUnitPriceUsd = paidUnits > 0 ? roundMoney(paidGross / paidUnits) : row.averageUnitPriceUsd;
      rows.set(packId, row);
    }

    return [...rows.values()].sort((left, right) => {
      if (right.netUsd !== left.netUsd) return right.netUsd - left.netUsd;
      return left.packId.localeCompare(right.packId);
    });
  }

  markEventsSettled(payload: { creatorUserId: string; payoutId: string; eventIds: string[] }): void {
    const idSet = new Set(payload.eventIds);
    for (let index = 0; index < this.events.length; index += 1) {
      const event = this.events[index];
      if (event.creatorUserId !== payload.creatorUserId) continue;
      if (!idSet.has(event.id)) continue;
      this.events[index] = {
        ...event,
        settledPayoutId: payload.payoutId,
      };
    }
  }

  exportState(): CreatorRevenueShareSnapshot {
    return {
      listings: [...this.listingsByPackId.values()].map((listing) => ({ ...listing })),
      events: this.events.map((event) => ({
        ...event,
        metadata: event.metadata ? { ...event.metadata } : undefined,
      })),
      capturedAtIso: new Date().toISOString(),
    };
  }

  exportCreatorState(creatorUserId: string): CreatorRevenueShareSnapshot {
    return {
      listings: this.listPackListings(creatorUserId),
      events: this.events
        .filter((event) => event.creatorUserId === creatorUserId)
        .map((event) => ({
          ...event,
          metadata: event.metadata ? { ...event.metadata } : undefined,
        })),
      capturedAtIso: new Date().toISOString(),
    };
  }

  hydrateState(snapshot: CreatorRevenueShareSnapshot): void {
    for (const listing of snapshot.listings ?? []) {
      if (!listing?.packId) continue;
      this.listingsByPackId.set(listing.packId, { ...listing });
    }

    const byEventId = new Map<string, CreatorRevenueEvent>();
    for (const event of this.events) {
      byEventId.set(event.id, {
        ...event,
        metadata: event.metadata ? { ...event.metadata } : undefined,
      });
    }
    for (const event of snapshot.events ?? []) {
      if (!event?.id) continue;
      byEventId.set(event.id, {
        ...event,
        metadata: event.metadata ? { ...event.metadata } : undefined,
      });
    }
    this.events.length = 0;
    this.events.push(
      ...[...byEventId.values()].sort(
        (left, right) => Date.parse(left.createdAtIso) - Date.parse(right.createdAtIso)
      )
    );
  }

  resetForTests(): void {
    this.listingsByPackId.clear();
    this.events.length = 0;
  }

  private recordRevenueEvent(payload: {
    packId: string;
    buyerUserId?: string;
    quantity?: number;
    unitPriceUsd?: number;
    eventType: 'install_purchase' | 'subscription_renewal';
    nowIso?: string;
  }): CreatorRevenueEvent {
    const listing = this.requirePackListing(payload.packId);
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const quantity = Math.max(1, Math.trunc(payload.quantity ?? 1));
    const unitPriceUsd =
      listing.model === 'premium'
        ? roundMoney(Math.max(0, payload.unitPriceUsd ?? listing.unitPriceUsd))
        : 0;
    const split = this.calculateSplit(quantity * unitPriceUsd);

    const event: CreatorRevenueEvent = {
      id: makeId('rev'),
      packId: listing.packId,
      creatorUserId: listing.creatorUserId,
      buyerUserId: payload.buyerUserId,
      eventType: payload.eventType,
      quantity,
      unitPriceUsd,
      grossUsd: split.grossUsd,
      platformFeeUsd: split.platformFeeUsd,
      creatorNetUsd: split.creatorNetUsd,
      currency: 'USD',
      createdAtIso: nowIso,
    };
    this.events.push(event);
    return { ...event };
  }

  private calculateSplit(grossUsd: number): {
    grossUsd: number;
    platformFeeUsd: number;
    creatorNetUsd: number;
  } {
    const gross = roundMoney(grossUsd);
    const platformFeeUsd = roundMoney(gross * this.platformFeeRate);
    const creatorNetUsd = roundMoney(gross - platformFeeUsd);
    return {
      grossUsd: gross,
      platformFeeUsd,
      creatorNetUsd,
    };
  }

  private requirePackListing(packId: string): CreatorPackRevenueListing {
    const listing = this.listingsByPackId.get(packId);
    if (!listing) {
      throw new Error(`Pack ${packId} is not registered for creator revenue share.`);
    }
    return listing;
  }
}

export const creatorRevenueLedger = new CreatorRevenueShareLedger();
