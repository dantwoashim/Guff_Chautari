import { getPricingTier } from './tiers';
import { UsageMeteringEngine, type UsageMeteringSnapshot } from './metering';
import { StripeBillingService, type StripeBillingSnapshot } from './stripe';
import type {
  Invoice,
  PricingTierId,
  StripeBillingCustomer,
  Subscription,
  UsageMetric,
  UsageRecord,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const roundMoney = (value: number): number => Number(value.toFixed(2));

export interface BillingWorkspaceAccount {
  workspaceId: string;
  ownerUserId: string;
  organizationId?: string;
  customerId: string;
  subscriptionId: string;
  budgetAlertThresholdUsd?: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface WorkspaceCostAttributionRow {
  workspaceId: string;
  customerId: string;
  subscriptionId: string;
  tierId: PricingTierId;
  subscriptionStatus: Subscription['status'];
  recurringUsd: number;
  usageUsd: number;
  openInvoiceUsd: number;
  budgetAlertThresholdUsd?: number;
}

export interface OrganizationBillingSummary {
  organizationId: string;
  workspaceCount: number;
  activeSubscriptions: number;
  recurringUsd: number;
  usageUsd: number;
  openInvoiceUsd: number;
}

export interface PersistedWorkspaceBillingState {
  workspaceId: string;
  account: BillingWorkspaceAccount;
  customer: StripeBillingCustomer | null;
  subscription: Subscription | null;
  invoices: Invoice[];
  usageRecords: UsageRecord[];
  capturedAtIso: string;
}

export interface BillingRuntimeSnapshot {
  accounts: BillingWorkspaceAccount[];
  stripe: StripeBillingSnapshot;
  metering: UsageMeteringSnapshot;
  capturedAtIso: string;
}

export class BillingRuntime {
  private readonly accountsByWorkspaceId = new Map<string, BillingWorkspaceAccount>();

  constructor(
    private readonly stripe: StripeBillingService = new StripeBillingService(),
    private readonly metering: UsageMeteringEngine = new UsageMeteringEngine()
  ) {}

  ensureWorkspaceAccount(payload: {
    workspaceId: string;
    ownerUserId: string;
    organizationId?: string;
    email?: string;
    tierId?: PricingTierId;
    seatCount?: number;
    nowIso?: string;
  }): {
    account: BillingWorkspaceAccount;
    customer: StripeBillingCustomer;
    subscription: Subscription;
  } {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const existing = this.accountsByWorkspaceId.get(payload.workspaceId);
    if (existing) {
      const customer = this.stripe.getCustomer(existing.customerId);
      const subscription = this.stripe.getSubscription(existing.subscriptionId);
      if (!customer || !subscription) {
        this.accountsByWorkspaceId.delete(payload.workspaceId);
      } else {
        return {
          account: { ...existing },
          customer,
          subscription,
        };
      }
    }

    const customer = this.stripe.createCustomer({
      email: payload.email,
      workspaceId: payload.workspaceId,
      organizationId: payload.organizationId,
      nowIso,
    });

    const subscription = this.stripe.createSubscription({
      customerId: customer.id,
      tierId: payload.tierId ?? 'free',
      seatCount: payload.seatCount,
      nowIso,
    });

    this.stripe.handleWebhook({
      type: 'customer.subscription.created',
      receivedAtIso: nowIso,
      payload: {
        subscriptionId: subscription.id,
        status: 'active',
      },
    });

    const account: BillingWorkspaceAccount = {
      workspaceId: payload.workspaceId,
      ownerUserId: payload.ownerUserId,
      organizationId: payload.organizationId,
      customerId: customer.id,
      subscriptionId: subscription.id,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.accountsByWorkspaceId.set(account.workspaceId, account);

    return {
      account: { ...account },
      customer,
      subscription: this.requireSubscription(account.subscriptionId),
    };
  }

  listWorkspaceAccounts(filters?: { organizationId?: string }): BillingWorkspaceAccount[] {
    return [...this.accountsByWorkspaceId.values()]
      .filter((account) => (filters?.organizationId ? account.organizationId === filters.organizationId : true))
      .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId))
      .map((account) => ({ ...account }));
  }

  getWorkspaceAccount(workspaceId: string): BillingWorkspaceAccount | null {
    const account = this.accountsByWorkspaceId.get(workspaceId);
    return account ? { ...account } : null;
  }

  getWorkspaceSubscription(workspaceId: string): Subscription | null {
    const account = this.accountsByWorkspaceId.get(workspaceId);
    if (!account) return null;
    return this.stripe.getSubscription(account.subscriptionId);
  }

  changeWorkspaceTier(payload: {
    workspaceId: string;
    tierId: PricingTierId;
    effectiveAtIso?: string;
    nowIso?: string;
  }): Subscription {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const account = this.requireWorkspaceAccount(payload.workspaceId);
    const updated = this.stripe.changeSubscriptionTier({
      subscriptionId: account.subscriptionId,
      tierId: payload.tierId,
      effectiveAtIso: payload.effectiveAtIso ?? nowIso,
      nowIso,
    });

    this.stripe.handleWebhook({
      type: 'customer.subscription.updated',
      receivedAtIso: nowIso,
      payload: {
        subscriptionId: updated.id,
        status: 'active',
      },
    });

    this.accountsByWorkspaceId.set(payload.workspaceId, {
      ...account,
      updatedAtIso: nowIso,
    });
    return this.requireSubscription(account.subscriptionId);
  }

  recordUsage(payload: {
    workspaceId: string;
    metric: UsageMetric;
    quantity?: number;
    nowIso?: string;
  }): void {
    const account = this.requireWorkspaceAccount(payload.workspaceId);
    this.metering.recordUsage({
      organizationId: account.organizationId,
      workspaceId: account.workspaceId,
      subscriptionId: account.subscriptionId,
      metric: payload.metric,
      quantity: payload.quantity,
      nowIso: payload.nowIso,
    });
  }

  flushUsage(nowIso?: string): number {
    return this.metering.flush(nowIso);
  }

  listUsageRecords(filters?: {
    workspaceId?: string;
    organizationId?: string;
    subscriptionId?: string;
    fromIso?: string;
    toIso?: string;
  }): UsageRecord[] {
    return this.metering.listUsageRecords({
      workspaceId: filters?.workspaceId,
      organizationId: filters?.organizationId,
      subscriptionId: filters?.subscriptionId,
      fromIso: filters?.fromIso,
      toIso: filters?.toIso,
    });
  }

  getWorkspaceUsageSummary(payload: {
    workspaceId: string;
    fromIso?: string;
    toIso?: string;
    nowIso?: string;
  }) {
    const account = this.requireWorkspaceAccount(payload.workspaceId);
    return this.metering.summarizeUsage(
      {
        workspaceId: account.workspaceId,
        subscriptionId: account.subscriptionId,
        fromIso: payload.fromIso,
        toIso: payload.toIso,
      },
      payload.nowIso
    );
  }

  generateWorkspaceInvoice(payload: {
    workspaceId: string;
    periodStartIso?: string;
    periodEndIso?: string;
    nowIso?: string;
  }): Invoice {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const account = this.requireWorkspaceAccount(payload.workspaceId);
    const subscription = this.requireSubscription(account.subscriptionId);
    const periodEndIso = payload.periodEndIso ?? nowIso;
    const periodStartIso =
      payload.periodStartIso ?? new Date(toMs(periodEndIso) - 30 * DAY_MS).toISOString();
    const usageRecords = this.metering.listUsageRecords({
      workspaceId: account.workspaceId,
      subscriptionId: account.subscriptionId,
      fromIso: periodStartIso,
      toIso: periodEndIso,
    });

    const invoice = this.stripe.createInvoice({
      customerId: account.customerId,
      subscriptionId: account.subscriptionId,
      periodStartIso,
      periodEndIso,
      usageRecords,
      prorationUsd: subscription.pendingProrationUsd ?? 0,
      nowIso,
      status: 'open',
    });

    if (subscription.pendingProrationUsd) {
      const updated = this.stripe.setPendingProration(subscription.id, undefined, nowIso);
      this.stripe.handleWebhook({
        type: 'customer.subscription.updated',
        receivedAtIso: nowIso,
        payload: {
          subscriptionId: updated.id,
          status: updated.status,
        },
      });
    }

    return invoice;
  }

  listWorkspaceInvoices(workspaceId: string): Invoice[] {
    const account = this.requireWorkspaceAccount(workspaceId);
    return this.stripe.listInvoices({
      customerId: account.customerId,
      subscriptionId: account.subscriptionId,
    });
  }

  setBudgetAlert(payload: {
    workspaceId: string;
    thresholdUsd?: number;
    nowIso?: string;
  }): BillingWorkspaceAccount {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const account = this.requireWorkspaceAccount(payload.workspaceId);
    const updated: BillingWorkspaceAccount = {
      ...account,
      budgetAlertThresholdUsd:
        typeof payload.thresholdUsd === 'number' && payload.thresholdUsd > 0
          ? roundMoney(payload.thresholdUsd)
          : undefined,
      updatedAtIso: nowIso,
    };
    this.accountsByWorkspaceId.set(updated.workspaceId, updated);
    return { ...updated };
  }

  getWorkspaceCostAttribution(payload: {
    workspaceIds?: string[];
    organizationId?: string;
    fromIso?: string;
    toIso?: string;
  }): WorkspaceCostAttributionRow[] {
    const accounts = [...this.accountsByWorkspaceId.values()]
      .filter((account) => (payload.workspaceIds ? payload.workspaceIds.includes(account.workspaceId) : true))
      .filter((account) =>
        payload.organizationId ? account.organizationId === payload.organizationId : true
      );

    return accounts
      .map((account) => {
        const subscription = this.requireSubscription(account.subscriptionId);
        const tier = getPricingTier(subscription.tierId);
        const recurringUsd =
          tier.monthlyPriceUsd === null
            ? 0
            : roundMoney(
                tier.perSeat ? tier.monthlyPriceUsd * subscription.seatCount : tier.monthlyPriceUsd
              );
        const usageRows = this.metering.listUsageRecords({
          workspaceId: account.workspaceId,
          subscriptionId: account.subscriptionId,
          fromIso: payload.fromIso,
          toIso: payload.toIso,
        });
        const usageUsd = roundMoney(
          usageRows.reduce((sum, row) => {
            const unit =
              row.metric === 'workspace_count'
                ? 1
                : row.metric === 'team_member_count'
                  ? 2
                  : row.metric === 'api_calls'
                    ? 0.0002
                    : row.metric === 'key_vault_storage_bytes'
                      ? 0.0000004
                      : 0.01;
            return sum + row.quantity * unit;
          }, 0)
        );
        const openInvoiceUsd = roundMoney(
          this.stripe
            .listInvoices({
              subscriptionId: account.subscriptionId,
              customerId: account.customerId,
            })
            .filter((invoice) => invoice.status === 'open')
            .reduce((sum, invoice) => sum + invoice.totalUsd, 0)
        );
        return {
          workspaceId: account.workspaceId,
          customerId: account.customerId,
          subscriptionId: account.subscriptionId,
          tierId: subscription.tierId,
          subscriptionStatus: subscription.status,
          recurringUsd,
          usageUsd,
          openInvoiceUsd,
          budgetAlertThresholdUsd: account.budgetAlertThresholdUsd,
        };
      })
      .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
  }

  getOrganizationBillingSummary(payload: {
    organizationId: string;
    fromIso?: string;
    toIso?: string;
  }): OrganizationBillingSummary {
    const rows = this.getWorkspaceCostAttribution({
      organizationId: payload.organizationId,
      fromIso: payload.fromIso,
      toIso: payload.toIso,
    });
    return {
      organizationId: payload.organizationId,
      workspaceCount: rows.length,
      activeSubscriptions: rows.filter((row) => row.subscriptionStatus === 'active').length,
      recurringUsd: roundMoney(rows.reduce((sum, row) => sum + row.recurringUsd, 0)),
      usageUsd: roundMoney(rows.reduce((sum, row) => sum + row.usageUsd, 0)),
      openInvoiceUsd: roundMoney(rows.reduce((sum, row) => sum + row.openInvoiceUsd, 0)),
    };
  }

  captureWorkspaceState(workspaceId: string): PersistedWorkspaceBillingState | null {
    const account = this.accountsByWorkspaceId.get(workspaceId);
    if (!account) return null;

    return {
      workspaceId,
      account: { ...account },
      customer: this.stripe.getCustomer(account.customerId),
      subscription: this.stripe.getSubscription(account.subscriptionId),
      invoices: this.stripe.listInvoices({
        customerId: account.customerId,
        subscriptionId: account.subscriptionId,
      }),
      usageRecords: this.metering.listUsageRecords({
        workspaceId: account.workspaceId,
        subscriptionId: account.subscriptionId,
      }),
      capturedAtIso: new Date().toISOString(),
    };
  }

  hydrateWorkspaceState(snapshot: PersistedWorkspaceBillingState): void {
    const workspaceId = snapshot.workspaceId || snapshot.account?.workspaceId;
    if (!workspaceId || !snapshot.account) return;

    const account: BillingWorkspaceAccount = {
      ...snapshot.account,
      workspaceId,
    };
    this.accountsByWorkspaceId.set(workspaceId, account);

    if (snapshot.customer) {
      this.stripe.upsertCustomer(snapshot.customer);
    }
    if (snapshot.subscription) {
      this.stripe.upsertSubscription(snapshot.subscription);
    }
    if (snapshot.invoices.length > 0) {
      this.stripe.upsertInvoices(snapshot.invoices);
    }
    if (snapshot.usageRecords.length > 0) {
      this.metering.upsertUsageRecords(snapshot.usageRecords);
    }
  }

  exportState(): BillingRuntimeSnapshot {
    return {
      accounts: [...this.accountsByWorkspaceId.values()].map((account) => ({ ...account })),
      stripe: this.stripe.exportState(),
      metering: this.metering.exportState(),
      capturedAtIso: new Date().toISOString(),
    };
  }

  hydrateState(snapshot: BillingRuntimeSnapshot): void {
    this.accountsByWorkspaceId.clear();
    for (const account of snapshot.accounts ?? []) {
      if (!account?.workspaceId) continue;
      this.accountsByWorkspaceId.set(account.workspaceId, { ...account });
    }
    this.stripe.hydrateState(snapshot.stripe);
    this.metering.hydrateState(snapshot.metering);
  }

  resetForTests(): void {
    this.accountsByWorkspaceId.clear();
    this.metering.resetForTests();
    this.stripe.resetForTests();
  }

  private requireWorkspaceAccount(workspaceId: string): BillingWorkspaceAccount {
    const account = this.accountsByWorkspaceId.get(workspaceId);
    if (!account) {
      throw new Error(`Workspace ${workspaceId} has no billing account.`);
    }
    return account;
  }

  private requireSubscription(subscriptionId: string): Subscription {
    const subscription = this.stripe.getSubscription(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found.`);
    }
    return subscription;
  }
}

export const billingRuntime = new BillingRuntime();
