export type PricingTierId = 'free' | 'pro' | 'team' | 'enterprise';

export type BillingSupportModel = 'community' | 'email' | 'sla' | 'dedicated';

export type TierLimitValue = number | 'unlimited' | 'all' | 'custom';

export interface PricingTier {
  id: PricingTierId;
  name: string;
  monthlyPriceUsd: number | null;
  perSeat: boolean;
  byokRequired: boolean;
  supportModel: BillingSupportModel;
  features: string[];
  limits: {
    workspaces: TierLimitValue;
    verticals: TierLimitValue;
    teamMembers: TierLimitValue;
  };
}

export type SubscriptionStatus =
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'paused';

export interface Subscription {
  id: string;
  customerId: string;
  tierId: PricingTierId;
  status: SubscriptionStatus;
  seatCount: number;
  currentPeriodStartIso: string;
  currentPeriodEndIso: string;
  createdAtIso: string;
  updatedAtIso: string;
  canceledAtIso?: string;
  pendingProrationUsd?: number;
}

export type UsageMetric =
  | 'workspace_count'
  | 'team_member_count'
  | 'api_calls'
  | 'key_vault_storage_bytes'
  | 'connector_executions';

export interface UsageRecord {
  id: string;
  organizationId?: string;
  workspaceId?: string;
  subscriptionId?: string;
  metric: UsageMetric;
  quantity: number;
  windowStartIso: string;
  windowEndIso: string;
  flushedAtIso: string;
}

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export interface InvoiceLineItem {
  id: string;
  kind: 'base_subscription' | 'usage' | 'proration' | 'credit';
  description: string;
  metric?: UsageMetric;
  quantity?: number;
  unitPriceUsd?: number;
  amountUsd: number;
}

export interface Invoice {
  id: string;
  customerId: string;
  subscriptionId: string;
  status: InvoiceStatus;
  currency: 'USD';
  periodStartIso: string;
  periodEndIso: string;
  lineItems: InvoiceLineItem[];
  subtotalUsd: number;
  taxUsd: number;
  totalUsd: number;
  createdAtIso: string;
  finalizedAtIso?: string;
  paidAtIso?: string;
}

export interface StripeBillingCustomer {
  id: string;
  email?: string;
  name?: string;
  organizationId?: string;
  workspaceId?: string;
  createdAtIso: string;
}

export type StripeWebhookType =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.payment_failed'
  | 'invoice.paid';

export interface StripeWebhookEvent {
  id: string;
  type: StripeWebhookType;
  receivedAtIso: string;
  payload: Record<string, unknown>;
}

export interface ProrationAdjustment {
  fromTierId: PricingTierId;
  toTierId: PricingTierId;
  amountUsd: number;
  ratioRemaining: number;
  effectiveAtIso: string;
}
