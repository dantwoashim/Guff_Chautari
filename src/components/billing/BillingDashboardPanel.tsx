import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  billingRuntime,
  hydrateWorkspaceBillingState,
  getPricingTier,
  listPricingTiers,
  persistWorkspaceBillingState,
  type PricingTierId,
  type UsageMetric,
} from '../../billing';

interface BillingDashboardPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const metricLabel: Record<UsageMetric, string> = {
  workspace_count: 'Workspace Count',
  team_member_count: 'Team Members',
  api_calls: 'API Calls',
  key_vault_storage_bytes: 'Key Vault Storage (bytes)',
  connector_executions: 'Connector Runs',
};

const asCurrency = (value: number): string => `$${value.toFixed(2)}`;

const ensureBillingSeedData = (payload: { userId: string; workspaceId: string }): boolean => {
  billingRuntime.ensureWorkspaceAccount({
    workspaceId: payload.workspaceId,
    ownerUserId: payload.userId,
    tierId: 'free',
    email: `${payload.userId}@example.com`,
  });
  const hasUsage = billingRuntime.listUsageRecords({
    workspaceId: payload.workspaceId,
  }).length > 0;
  const hasInvoices = billingRuntime.listWorkspaceInvoices(payload.workspaceId).length > 0;
  if (hasUsage || hasInvoices) return false;

  billingRuntime.recordUsage({
    workspaceId: payload.workspaceId,
    metric: 'api_calls',
    quantity: 240,
  });
  billingRuntime.recordUsage({
    workspaceId: payload.workspaceId,
    metric: 'connector_executions',
    quantity: 12,
  });
  billingRuntime.recordUsage({
    workspaceId: payload.workspaceId,
    metric: 'key_vault_storage_bytes',
    quantity: 450_000,
  });
  billingRuntime.flushUsage();
  billingRuntime.generateWorkspaceInvoice({
    workspaceId: payload.workspaceId,
  });
  return true;
};

export const BillingDashboardPanel: React.FC<BillingDashboardPanelProps> = ({ userId }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [status, setStatus] = useState('');
  const [isHydrating, setIsHydrating] = useState(true);
  const workspaceId = `workspace-${userId}`;

  const refresh = () => setRefreshTick((tick) => tick + 1);

  const persistState = useCallback(async () => {
    await persistWorkspaceBillingState({
      runtime: billingRuntime,
      userId,
      workspaceId,
    });
  }, [userId, workspaceId]);

  useEffect(() => {
    let active = true;
    setIsHydrating(true);
    setStatus('');

    const bootstrap = async () => {
      await hydrateWorkspaceBillingState({
        runtime: billingRuntime,
        userId,
        workspaceId,
      });
      ensureBillingSeedData({ userId, workspaceId });
      await persistState();

      if (!active) return;
      setRefreshTick((tick) => tick + 1);
      setIsHydrating(false);
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, [persistState, userId, workspaceId]);

  const snapshot = useMemo(() => {
    void refreshTick;
    const account = billingRuntime.getWorkspaceAccount(workspaceId);
    const subscription = billingRuntime.getWorkspaceSubscription(workspaceId);
    const activeTier = subscription ? getPricingTier(subscription.tierId) : getPricingTier('free');
    const usageSummary = account
      ? billingRuntime.getWorkspaceUsageSummary({
          workspaceId,
        })
      : {
          generatedAtIso: new Date().toISOString(),
          rows: [],
          totalQuantity: 0,
        };
    const invoices = account ? billingRuntime.listWorkspaceInvoices(workspaceId) : [];
    const usageRecords = account
      ? billingRuntime.listUsageRecords({
          workspaceId,
        })
      : [];
    const usageByMetric = Object.fromEntries(
      usageSummary.rows.map((row) => [row.metric, row.quantity])
    ) as Partial<Record<UsageMetric, number>>;

    return {
      account,
      subscription,
      activeTier,
      usageSummary,
      invoices,
      usageRecords,
      usageByMetric,
    };
  }, [refreshTick, workspaceId]);

  const tiers = listPricingTiers();

  const changeTier = async (tierId: PricingTierId) => {
    try {
      billingRuntime.changeWorkspaceTier({
        workspaceId,
        tierId,
      });
      await persistState();
      setStatus(`Plan changed to ${tierId.toUpperCase()}.`);
      refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Tier change failed.');
    }
  };

  const simulateUsageBurst = async () => {
    try {
      billingRuntime.recordUsage({
        workspaceId,
        metric: 'api_calls',
        quantity: 100,
      });
      billingRuntime.recordUsage({
        workspaceId,
        metric: 'connector_executions',
        quantity: 4,
      });
      billingRuntime.flushUsage();
      await persistState();
      setStatus('Recorded simulated usage burst.');
      refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Usage simulation failed.');
    }
  };

  const generateInvoice = async () => {
    try {
      const invoice = billingRuntime.generateWorkspaceInvoice({ workspaceId });
      await persistState();
      setStatus(`Generated invoice ${invoice.id} (${asCurrency(invoice.totalUsd)}).`);
      refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Invoice generation failed.');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className={panelClass}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#e9edef]">Billing Dashboard</h2>
              <p className="mt-1 text-sm text-[#8ea1ab]">
                Current plan, usage metering, invoices, and instant upgrade or downgrade controls.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                onClick={() => void simulateUsageBurst()}
                disabled={isHydrating}
              >
                Simulate Usage
              </button>
              <button
                type="button"
                className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                onClick={() => void generateInvoice()}
                disabled={isHydrating}
              >
                Generate Invoice
              </button>
              <button
                type="button"
                className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                onClick={refresh}
              >
                Refresh
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">Plan</div>
            <div className="mt-1 text-xl text-[#e9edef]">{snapshot.activeTier.name}</div>
          </article>
          <article className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">Monthly price</div>
            <div className="mt-1 text-xl text-[#e9edef]">
              {snapshot.activeTier.monthlyPriceUsd === null
                ? 'Custom'
                : asCurrency(snapshot.activeTier.monthlyPriceUsd)}
            </div>
          </article>
          <article className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">Subscription status</div>
            <div className="mt-1 text-xl text-[#e9edef]">{snapshot.subscription?.status ?? 'inactive'}</div>
          </article>
          <article className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">Open invoices</div>
            <div className="mt-1 text-xl text-[#e9edef]">
              {
                snapshot.invoices.filter((invoice) => invoice.status === 'open' || invoice.status === 'draft')
                  .length
              }
            </div>
          </article>
        </section>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Upgrade / Downgrade</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((tier) => {
              const active = snapshot.subscription?.tierId === tier.id;
              return (
                <div key={tier.id} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#e9edef]">{tier.name}</span>
                    <span className="text-[#8ea1ab]">
                      {tier.monthlyPriceUsd === null ? 'Custom' : `${asCurrency(tier.monthlyPriceUsd)}/mo`}
                    </span>
                  </div>
                  <div className="mt-2 text-[#8ea1ab]">
                    {tier.features.slice(0, 3).join(' • ')}
                  </div>
                  <button
                    type="button"
                    className={`mt-3 w-full rounded border px-2 py-1 text-[11px] ${
                      active
                        ? 'border-[#3f6f5f] bg-[#143228] text-[#a5e7c6]'
                        : 'border-[#425a68] text-[#bfd8e8] hover:bg-[#1d3140]'
                    }`}
                    onClick={() => void changeTier(tier.id)}
                    disabled={active || isHydrating}
                  >
                    {active ? 'Current Plan' : `Switch to ${tier.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Usage Metrics</h3>
            <div className="space-y-2 text-xs">
              {(Object.keys(metricLabel) as UsageMetric[]).map((metric) => (
                <div key={metric} className="rounded border border-[#27343d] bg-[#0f171c] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[#e9edef]">{metricLabel[metric]}</span>
                    <span className="text-[#8ea1ab]">{snapshot.usageByMetric[metric] ?? 0}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Usage Trend (Recent Flushes)</h3>
            {snapshot.usageRecords.length === 0 ? (
              <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                No usage records yet.
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {snapshot.usageRecords.slice(-10).reverse().map((record) => (
                  <div key={record.id} className="rounded border border-[#27343d] bg-[#0f171c] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[#e9edef]">{metricLabel[record.metric]}</span>
                      <span className="text-[#8ea1ab]">{record.quantity}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-[#7b919c]">
                      Flushed {new Date(record.flushedAtIso).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Invoice History</h3>
          {snapshot.invoices.length === 0 ? (
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              No invoices generated yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left text-[#8ea1ab]">Invoice</th>
                    <th className="px-2 py-1 text-left text-[#8ea1ab]">Status</th>
                    <th className="px-2 py-1 text-left text-[#8ea1ab]">Period</th>
                    <th className="px-2 py-1 text-left text-[#8ea1ab]">Total</th>
                    <th className="px-2 py-1 text-left text-[#8ea1ab]">Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="px-2 py-1 text-[#dfe7eb]">{invoice.id}</td>
                      <td className="px-2 py-1 text-[#9fb0ba]">{invoice.status}</td>
                      <td className="px-2 py-1 text-[#9fb0ba]">
                        {new Date(invoice.periodStartIso).toLocaleDateString()} -{' '}
                        {new Date(invoice.periodEndIso).toLocaleDateString()}
                      </td>
                      <td className="px-2 py-1 text-[#dfe7eb]">{asCurrency(invoice.totalUsd)}</td>
                      <td className="px-2 py-1 text-[#9fb0ba]">{invoice.lineItems.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {status ? (
          <div className="rounded border border-[#31596b] bg-[#102531] px-3 py-2 text-xs text-[#b8dbeb]">
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default BillingDashboardPanel;
