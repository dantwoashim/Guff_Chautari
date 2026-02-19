import { describe, expect, it } from 'vitest';
import { BillingRuntime } from '../runtime';
import { StripeBillingService } from '../stripe';
import { UsageMeteringEngine } from '../metering';

describe('billing runtime', () => {
  it('tracks workspace account, usage, and invoices', () => {
    let nowMs = Date.parse('2027-01-01T00:00:00.000Z');
    const runtime = new BillingRuntime(
      new StripeBillingService(),
      new UsageMeteringEngine({
        flushIntervalMs: 5_000,
        nowMs: () => nowMs,
      })
    );

    const account = runtime.ensureWorkspaceAccount({
      workspaceId: 'ws-runtime',
      ownerUserId: 'owner-runtime',
      organizationId: 'org-runtime',
      tierId: 'pro',
      email: 'owner@example.com',
      nowIso: '2027-01-01T00:00:00.000Z',
    });
    expect(account.subscription.tierId).toBe('pro');

    for (let index = 0; index < 100; index += 1) {
      runtime.recordUsage({
        workspaceId: 'ws-runtime',
        metric: 'api_calls',
        nowIso: '2027-01-01T00:00:01.000Z',
      });
    }

    nowMs += 6_000;
    runtime.flushUsage(new Date(nowMs).toISOString());

    const usage = runtime.getWorkspaceUsageSummary({
      workspaceId: 'ws-runtime',
      nowIso: '2027-01-01T00:00:07.000Z',
    });
    expect(usage.totalQuantity).toBe(100);

    const invoice = runtime.generateWorkspaceInvoice({
      workspaceId: 'ws-runtime',
      periodStartIso: '2027-01-01T00:00:00.000Z',
      periodEndIso: '2027-01-31T00:00:00.000Z',
      nowIso: '2027-01-31T00:00:00.000Z',
    });
    expect(invoice.totalUsd).toBeGreaterThan(0);

    const orgSummary = runtime.getOrganizationBillingSummary({
      organizationId: 'org-runtime',
    });
    expect(orgSummary.workspaceCount).toBe(1);
    expect(orgSummary.recurringUsd).toBeGreaterThan(0);
  });
});
