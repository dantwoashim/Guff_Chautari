import { getPricingTier } from './tiers';
import type {
  Invoice,
  InvoiceLineItem,
  InvoiceStatus,
  PricingTierId,
  ProrationAdjustment,
  StripeBillingCustomer,
  StripeWebhookEvent,
  StripeWebhookType,
  Subscription,
  SubscriptionStatus,
  UsageMetric,
  UsageRecord,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

const USAGE_UNIT_PRICING_USD: Record<UsageMetric, number> = {
  workspace_count: 1,
  team_member_count: 2,
  api_calls: 0.0002,
  key_vault_storage_bytes: 0.0000004,
  connector_executions: 0.01,
};

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const roundMoney = (value: number): number => Number(value.toFixed(2));

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const addDays = (iso: string, days: number): string => new Date(toMs(iso) + days * DAY_MS).toISOString();

export interface CreateCustomerInput {
  email?: string;
  name?: string;
  organizationId?: string;
  workspaceId?: string;
  nowIso?: string;
}

export interface CreateSubscriptionInput {
  customerId: string;
  tierId: PricingTierId;
  seatCount?: number;
  status?: SubscriptionStatus;
  nowIso?: string;
}

export interface CreateInvoiceInput {
  customerId: string;
  subscriptionId: string;
  periodStartIso: string;
  periodEndIso: string;
  usageRecords?: UsageRecord[];
  prorationUsd?: number;
  nowIso?: string;
  status?: InvoiceStatus;
}

export interface ChangeTierInput {
  subscriptionId: string;
  tierId: PricingTierId;
  effectiveAtIso?: string;
  nowIso?: string;
}

export interface StripeWebhookInput {
  type: StripeWebhookType;
  payload: Record<string, unknown>;
  id?: string;
  receivedAtIso?: string;
}

export interface StripeBillingSnapshot {
  customers: StripeBillingCustomer[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  webhookEvents: StripeWebhookEvent[];
}

export class StripeBillingService {
  private readonly customersById = new Map<string, StripeBillingCustomer>();
  private readonly subscriptionsById = new Map<string, Subscription>();
  private readonly invoicesById = new Map<string, Invoice>();
  private readonly webhookEvents: StripeWebhookEvent[] = [];

  createCustomer(input: CreateCustomerInput): StripeBillingCustomer {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const customer: StripeBillingCustomer = {
      id: makeId('cus'),
      email: input.email,
      name: input.name,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      createdAtIso: nowIso,
    };
    this.customersById.set(customer.id, customer);
    return customer;
  }

  getCustomer(customerId: string): StripeBillingCustomer | null {
    return this.customersById.get(customerId) ?? null;
  }

  createSubscription(input: CreateSubscriptionInput): Subscription {
    const nowIso = input.nowIso ?? new Date().toISOString();
    if (!this.customersById.has(input.customerId)) {
      throw new Error(`Customer ${input.customerId} not found.`);
    }

    const subscription: Subscription = {
      id: makeId('sub'),
      customerId: input.customerId,
      tierId: input.tierId,
      status: input.status ?? 'incomplete',
      seatCount: Math.max(1, Math.trunc(input.seatCount ?? 1)),
      currentPeriodStartIso: nowIso,
      currentPeriodEndIso: addDays(nowIso, 30),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.subscriptionsById.set(subscription.id, subscription);
    return subscription;
  }

  getSubscription(subscriptionId: string): Subscription | null {
    return this.subscriptionsById.get(subscriptionId) ?? null;
  }

  listSubscriptions(customerId?: string): Subscription[] {
    return [...this.subscriptionsById.values()]
      .filter((subscription) => (customerId ? subscription.customerId === customerId : true))
      .sort((left, right) => toMs(right.updatedAtIso) - toMs(left.updatedAtIso));
  }

  createInvoice(input: CreateInvoiceInput): Invoice {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const subscription = this.subscriptionsById.get(input.subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${input.subscriptionId} not found.`);
    }
    if (subscription.customerId !== input.customerId) {
      throw new Error('Subscription does not belong to provided customer.');
    }

    const tier = getPricingTier(subscription.tierId);
    const baseAmount =
      tier.monthlyPriceUsd === null
        ? 0
        : tier.perSeat
          ? tier.monthlyPriceUsd * subscription.seatCount
          : tier.monthlyPriceUsd;

    const lineItems: InvoiceLineItem[] = [];
    if (baseAmount > 0) {
      lineItems.push({
        id: makeId('line'),
        kind: 'base_subscription',
        description: `${tier.name} subscription`,
        quantity: tier.perSeat ? subscription.seatCount : 1,
        unitPriceUsd: tier.monthlyPriceUsd ?? 0,
        amountUsd: roundMoney(baseAmount),
      });
    }

    for (const usage of input.usageRecords ?? []) {
      const unitPrice = USAGE_UNIT_PRICING_USD[usage.metric];
      const amount = roundMoney(usage.quantity * unitPrice);
      if (amount === 0) continue;
      lineItems.push({
        id: makeId('line'),
        kind: 'usage',
        description: `Usage for ${usage.metric}`,
        metric: usage.metric,
        quantity: usage.quantity,
        unitPriceUsd: unitPrice,
        amountUsd: amount,
      });
    }

    if (input.prorationUsd && input.prorationUsd !== 0) {
      lineItems.push({
        id: makeId('line'),
        kind: input.prorationUsd > 0 ? 'proration' : 'credit',
        description: 'Proration adjustment',
        amountUsd: roundMoney(input.prorationUsd),
      });
    }

    const subtotalUsd = roundMoney(lineItems.reduce((sum, line) => sum + line.amountUsd, 0));
    const taxUsd = 0;
    const totalUsd = roundMoney(subtotalUsd + taxUsd);
    const invoice: Invoice = {
      id: makeId('inv'),
      customerId: input.customerId,
      subscriptionId: input.subscriptionId,
      status: input.status ?? 'open',
      currency: 'USD',
      periodStartIso: input.periodStartIso,
      periodEndIso: input.periodEndIso,
      lineItems,
      subtotalUsd,
      taxUsd,
      totalUsd,
      createdAtIso: nowIso,
      finalizedAtIso: nowIso,
      paidAtIso: input.status === 'paid' ? nowIso : undefined,
    };

    this.invoicesById.set(invoice.id, invoice);
    return invoice;
  }

  listInvoices(filters?: {
    customerId?: string;
    subscriptionId?: string;
    status?: InvoiceStatus;
  }): Invoice[] {
    return [...this.invoicesById.values()]
      .filter((invoice) => (filters?.customerId ? invoice.customerId === filters.customerId : true))
      .filter((invoice) =>
        filters?.subscriptionId ? invoice.subscriptionId === filters.subscriptionId : true
      )
      .filter((invoice) => (filters?.status ? invoice.status === filters.status : true))
      .sort((left, right) => toMs(right.createdAtIso) - toMs(left.createdAtIso));
  }

  calculateProration(input: {
    subscriptionId: string;
    nextTierId: PricingTierId;
    effectiveAtIso: string;
  }): ProrationAdjustment {
    const subscription = this.subscriptionsById.get(input.subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${input.subscriptionId} not found.`);
    }
    const fromTier = getPricingTier(subscription.tierId);
    const toTier = getPricingTier(input.nextTierId);

    const effectiveMs = toMs(input.effectiveAtIso);
    const periodStartMs = toMs(subscription.currentPeriodStartIso);
    const periodEndMs = toMs(subscription.currentPeriodEndIso);
    const durationMs = Math.max(1, periodEndMs - periodStartMs);
    const remainingMs = Math.max(0, periodEndMs - Math.max(periodStartMs, effectiveMs));
    const ratioRemaining = Math.min(1, remainingMs / durationMs);

    const fromBase =
      fromTier.monthlyPriceUsd === null
        ? 0
        : fromTier.perSeat
          ? fromTier.monthlyPriceUsd * subscription.seatCount
          : fromTier.monthlyPriceUsd;
    const toBase =
      toTier.monthlyPriceUsd === null
        ? 0
        : toTier.perSeat
          ? toTier.monthlyPriceUsd * subscription.seatCount
          : toTier.monthlyPriceUsd;
    const amountUsd = roundMoney((toBase - fromBase) * ratioRemaining);

    return {
      fromTierId: subscription.tierId,
      toTierId: input.nextTierId,
      amountUsd,
      ratioRemaining: Number(ratioRemaining.toFixed(4)),
      effectiveAtIso: input.effectiveAtIso,
    };
  }

  changeSubscriptionTier(input: ChangeTierInput): Subscription {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const effectiveAtIso = input.effectiveAtIso ?? nowIso;
    const subscription = this.subscriptionsById.get(input.subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${input.subscriptionId} not found.`);
    }

    const proration = this.calculateProration({
      subscriptionId: input.subscriptionId,
      nextTierId: input.tierId,
      effectiveAtIso,
    });

    const next: Subscription = {
      ...subscription,
      tierId: input.tierId,
      pendingProrationUsd: proration.amountUsd,
      updatedAtIso: nowIso,
    };
    this.subscriptionsById.set(next.id, next);
    return next;
  }

  setPendingProration(subscriptionId: string, amountUsd: number | undefined, nowIso?: string): Subscription {
    const current = this.subscriptionsById.get(subscriptionId);
    if (!current) {
      throw new Error(`Subscription ${subscriptionId} not found.`);
    }
    const next: Subscription = {
      ...current,
      pendingProrationUsd: amountUsd,
      updatedAtIso: nowIso ?? new Date().toISOString(),
    };
    this.subscriptionsById.set(subscriptionId, next);
    return next;
  }

  handleWebhook(input: StripeWebhookInput): StripeWebhookEvent {
    const event: StripeWebhookEvent = {
      id: input.id ?? makeId('evt'),
      type: input.type,
      receivedAtIso: input.receivedAtIso ?? new Date().toISOString(),
      payload: { ...input.payload },
    };

    if (input.type === 'customer.subscription.created' || input.type === 'customer.subscription.updated') {
      const subscriptionId = String(input.payload.subscriptionId ?? '');
      const statusRaw = input.payload.status;
      if (subscriptionId && this.subscriptionsById.has(subscriptionId)) {
        const current = this.subscriptionsById.get(subscriptionId)!;
        const status = this.toSubscriptionStatus(statusRaw) ?? 'active';
        this.subscriptionsById.set(subscriptionId, {
          ...current,
          status,
          updatedAtIso: event.receivedAtIso,
        });
      }
    }

    if (input.type === 'customer.subscription.deleted') {
      const subscriptionId = String(input.payload.subscriptionId ?? '');
      if (subscriptionId && this.subscriptionsById.has(subscriptionId)) {
        const current = this.subscriptionsById.get(subscriptionId)!;
        this.subscriptionsById.set(subscriptionId, {
          ...current,
          status: 'canceled',
          canceledAtIso: event.receivedAtIso,
          updatedAtIso: event.receivedAtIso,
        });
      }
    }

    if (input.type === 'invoice.payment_failed') {
      const invoiceId = String(input.payload.invoiceId ?? '');
      if (invoiceId && this.invoicesById.has(invoiceId)) {
        const invoice = this.invoicesById.get(invoiceId)!;
        this.invoicesById.set(invoiceId, {
          ...invoice,
          status: 'uncollectible',
        });
        const subscription = this.subscriptionsById.get(invoice.subscriptionId);
        if (subscription) {
          this.subscriptionsById.set(subscription.id, {
            ...subscription,
            status: 'past_due',
            updatedAtIso: event.receivedAtIso,
          });
        }
      }
    }

    if (input.type === 'invoice.paid') {
      const invoiceId = String(input.payload.invoiceId ?? '');
      if (invoiceId && this.invoicesById.has(invoiceId)) {
        const invoice = this.invoicesById.get(invoiceId)!;
        this.invoicesById.set(invoiceId, {
          ...invoice,
          status: 'paid',
          paidAtIso: event.receivedAtIso,
        });
        const subscription = this.subscriptionsById.get(invoice.subscriptionId);
        if (subscription && subscription.status !== 'canceled') {
          this.subscriptionsById.set(subscription.id, {
            ...subscription,
            status: 'active',
            updatedAtIso: event.receivedAtIso,
          });
        }
      }
    }

    this.webhookEvents.push(event);
    return event;
  }

  listWebhookEvents(): StripeWebhookEvent[] {
    return [...this.webhookEvents].sort((left, right) => toMs(left.receivedAtIso) - toMs(right.receivedAtIso));
  }

  exportState(): StripeBillingSnapshot {
    return {
      customers: [...this.customersById.values()].map((customer) => ({ ...customer })),
      subscriptions: [...this.subscriptionsById.values()].map((subscription) => ({ ...subscription })),
      invoices: [...this.invoicesById.values()].map((invoice) => ({
        ...invoice,
        lineItems: invoice.lineItems.map((lineItem) => ({ ...lineItem })),
      })),
      webhookEvents: this.webhookEvents.map((event) => ({
        ...event,
        payload: { ...event.payload },
      })),
    };
  }

  hydrateState(snapshot: StripeBillingSnapshot): void {
    this.customersById.clear();
    this.subscriptionsById.clear();
    this.invoicesById.clear();
    this.webhookEvents.length = 0;

    for (const customer of snapshot.customers ?? []) {
      this.upsertCustomer(customer);
    }
    for (const subscription of snapshot.subscriptions ?? []) {
      this.upsertSubscription(subscription);
    }
    for (const invoice of snapshot.invoices ?? []) {
      this.upsertInvoice(invoice);
    }

    const seenEventIds = new Set<string>();
    for (const event of snapshot.webhookEvents ?? []) {
      if (!event?.id || seenEventIds.has(event.id)) continue;
      seenEventIds.add(event.id);
      this.webhookEvents.push({
        ...event,
        payload: { ...(event.payload ?? {}) },
      });
    }
  }

  upsertCustomer(customer: StripeBillingCustomer): void {
    if (!customer?.id) return;
    this.customersById.set(customer.id, { ...customer });
  }

  upsertSubscription(subscription: Subscription): void {
    if (!subscription?.id) return;
    this.subscriptionsById.set(subscription.id, { ...subscription });
  }

  upsertInvoice(invoice: Invoice): void {
    if (!invoice?.id) return;
    this.invoicesById.set(invoice.id, {
      ...invoice,
      lineItems: invoice.lineItems.map((lineItem) => ({ ...lineItem })),
    });
  }

  upsertInvoices(invoices: ReadonlyArray<Invoice>): void {
    for (const invoice of invoices) {
      this.upsertInvoice(invoice);
    }
  }

  resetForTests(): void {
    this.customersById.clear();
    this.subscriptionsById.clear();
    this.invoicesById.clear();
    this.webhookEvents.length = 0;
  }

  private toSubscriptionStatus(value: unknown): SubscriptionStatus | null {
    if (typeof value !== 'string') return null;
    if (
      value === 'incomplete' ||
      value === 'trialing' ||
      value === 'active' ||
      value === 'past_due' ||
      value === 'canceled' ||
      value === 'paused'
    ) {
      return value;
    }
    return null;
  }
}
