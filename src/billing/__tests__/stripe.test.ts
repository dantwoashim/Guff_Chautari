import { describe, expect, it } from 'vitest';
import { StripeBillingService } from '../stripe';

describe('stripe billing integration layer', () => {
  it('creates customer/subscription and activates on webhook lifecycle event', () => {
    const stripe = new StripeBillingService();
    const customer = stripe.createCustomer({
      email: 'owner@example.com',
      workspaceId: 'ws-pro',
      nowIso: '2026-12-03T10:00:00.000Z',
    });

    const subscription = stripe.createSubscription({
      customerId: customer.id,
      tierId: 'pro',
      nowIso: '2026-12-03T10:01:00.000Z',
    });
    expect(subscription.status).toBe('incomplete');

    stripe.handleWebhook({
      type: 'customer.subscription.created',
      receivedAtIso: '2026-12-03T10:02:00.000Z',
      payload: {
        subscriptionId: subscription.id,
        status: 'active',
      },
    });

    const updated = stripe.getSubscription(subscription.id);
    expect(updated?.status).toBe('active');
  });

  it('computes proration for mid-cycle plan changes and invoices usage', () => {
    const stripe = new StripeBillingService();
    const customer = stripe.createCustomer({
      email: 'owner@example.com',
      workspaceId: 'ws-team',
      nowIso: '2026-12-10T00:00:00.000Z',
    });
    const subscription = stripe.createSubscription({
      customerId: customer.id,
      tierId: 'pro',
      nowIso: '2026-12-10T00:00:00.000Z',
    });

    const proration = stripe.calculateProration({
      subscriptionId: subscription.id,
      nextTierId: 'team',
      effectiveAtIso: '2026-12-25T00:00:00.000Z',
    });
    expect(proration.amountUsd).toBeGreaterThan(0);
    expect(proration.ratioRemaining).toBeGreaterThan(0);

    const changed = stripe.changeSubscriptionTier({
      subscriptionId: subscription.id,
      tierId: 'team',
      effectiveAtIso: '2026-12-25T00:00:00.000Z',
      nowIso: '2026-12-25T00:00:00.000Z',
    });
    expect(changed.pendingProrationUsd).toBe(proration.amountUsd);
    expect(changed.tierId).toBe('team');

    const invoice = stripe.createInvoice({
      customerId: customer.id,
      subscriptionId: changed.id,
      periodStartIso: '2026-12-10T00:00:00.000Z',
      periodEndIso: '2027-01-09T00:00:00.000Z',
      usageRecords: [
        {
          id: 'usage-1',
          workspaceId: 'ws-team',
          subscriptionId: changed.id,
          metric: 'api_calls',
          quantity: 1200,
          windowStartIso: '2026-12-10T00:00:00.000Z',
          windowEndIso: '2026-12-31T00:00:00.000Z',
          flushedAtIso: '2027-01-01T00:00:00.000Z',
        },
      ],
      prorationUsd: changed.pendingProrationUsd,
      nowIso: '2027-01-01T00:00:00.000Z',
    });

    expect(invoice.totalUsd).toBeGreaterThan(0);
    expect(invoice.lineItems.some((line) => line.kind === 'usage')).toBe(true);
    expect(invoice.lineItems.some((line) => line.kind === 'proration')).toBe(true);
  });
});
