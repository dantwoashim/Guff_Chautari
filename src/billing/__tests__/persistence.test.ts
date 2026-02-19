import { describe, expect, it } from 'vitest';
import { UsageMeteringEngine } from '../metering';
import { BillingRuntime } from '../runtime';
import { StripeBillingService } from '../stripe';

describe('billing runtime persistence helpers', () => {
  it('captures and hydrates per-workspace billing state', () => {
    let nowMs = Date.parse('2027-02-01T00:00:00.000Z');
    const source = new BillingRuntime(
      new StripeBillingService(),
      new UsageMeteringEngine({
        flushIntervalMs: 5_000,
        nowMs: () => nowMs,
      })
    );

    source.ensureWorkspaceAccount({
      workspaceId: 'ws-persist',
      ownerUserId: 'owner-1',
      organizationId: 'org-1',
      tierId: 'pro',
      nowIso: '2027-02-01T00:00:00.000Z',
    });
    source.recordUsage({
      workspaceId: 'ws-persist',
      metric: 'api_calls',
      quantity: 250,
      nowIso: '2027-02-01T00:00:02.000Z',
    });
    nowMs += 6_000;
    source.flushUsage(new Date(nowMs).toISOString());
    source.generateWorkspaceInvoice({
      workspaceId: 'ws-persist',
      periodStartIso: '2027-02-01T00:00:00.000Z',
      periodEndIso: '2027-02-28T00:00:00.000Z',
      nowIso: '2027-02-28T00:00:00.000Z',
    });

    const workspaceState = source.captureWorkspaceState('ws-persist');
    expect(workspaceState).not.toBeNull();
    if (!workspaceState) return;

    const restored = new BillingRuntime(
      new StripeBillingService(),
      new UsageMeteringEngine({
        flushIntervalMs: 5_000,
      })
    );
    restored.hydrateWorkspaceState(workspaceState);

    const restoredAccount = restored.getWorkspaceAccount('ws-persist');
    expect(restoredAccount).not.toBeNull();
    expect(restoredAccount?.budgetAlertThresholdUsd).toBeUndefined();

    const restoredSubscription = restored.getWorkspaceSubscription('ws-persist');
    expect(restoredSubscription?.tierId).toBe('pro');

    const restoredInvoices = restored.listWorkspaceInvoices('ws-persist');
    expect(restoredInvoices.length).toBe(1);
    expect(restoredInvoices[0].status).toBe('open');

    const restoredUsage = restored.getWorkspaceUsageSummary({
      workspaceId: 'ws-persist',
    });
    expect(restoredUsage.totalQuantity).toBe(250);
  });

  it('exports and hydrates full billing runtime snapshot', () => {
    const source = new BillingRuntime();
    source.ensureWorkspaceAccount({
      workspaceId: 'ws-1',
      ownerUserId: 'owner-1',
      organizationId: 'org-1',
      tierId: 'team',
      seatCount: 3,
      nowIso: '2027-03-01T00:00:00.000Z',
    });
    source.ensureWorkspaceAccount({
      workspaceId: 'ws-2',
      ownerUserId: 'owner-1',
      organizationId: 'org-1',
      tierId: 'pro',
      nowIso: '2027-03-01T00:01:00.000Z',
    });
    source.recordUsage({
      workspaceId: 'ws-1',
      metric: 'connector_executions',
      quantity: 9,
      nowIso: '2027-03-01T00:02:00.000Z',
    });
    source.flushUsage('2027-03-01T00:07:00.000Z');

    const snapshot = source.exportState();
    const restored = new BillingRuntime();
    restored.hydrateState(snapshot);

    const sourceOrgSummary = source.getOrganizationBillingSummary({
      organizationId: 'org-1',
    });
    const restoredOrgSummary = restored.getOrganizationBillingSummary({
      organizationId: 'org-1',
    });
    expect(restoredOrgSummary).toEqual(sourceOrgSummary);

    const sourceRows = source.getWorkspaceCostAttribution({
      organizationId: 'org-1',
    });
    const restoredRows = restored.getWorkspaceCostAttribution({
      organizationId: 'org-1',
    });
    expect(restoredRows).toEqual(sourceRows);
  });
});
