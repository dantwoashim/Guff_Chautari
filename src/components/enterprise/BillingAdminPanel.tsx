import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  billingRuntime,
  hydrateWorkspaceBillingState,
  persistWorkspaceBillingState,
  type PricingTierId,
} from '../../billing';
import { orgManager } from '../../enterprise';

interface BillingAdminPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const asCurrency = (value: number): string => `$${value.toFixed(2)}`;

const ensureOrgBillingSeed = (payload: { userId: string; organizationId: string; workspaceIds: string[] }) => {
  const tierOrder: PricingTierId[] = ['pro', 'team', 'free'];
  payload.workspaceIds.forEach((workspaceId, index) => {
    const tierId = tierOrder[index % tierOrder.length];
    billingRuntime.ensureWorkspaceAccount({
      workspaceId,
      ownerUserId: payload.userId,
      organizationId: payload.organizationId,
      email: `${payload.userId}@example.com`,
      tierId,
      seatCount: tierId === 'team' ? 4 : 1,
    });
    const hasUsage = billingRuntime.listUsageRecords({
      workspaceId,
    }).length > 0;
    const hasInvoices = billingRuntime.listWorkspaceInvoices(workspaceId).length > 0;
    if (hasUsage || hasInvoices) return;

    billingRuntime.recordUsage({
      workspaceId,
      metric: 'api_calls',
      quantity: 800 + index * 200,
    });
    billingRuntime.recordUsage({
      workspaceId,
      metric: 'connector_executions',
      quantity: 25 + index * 5,
    });
    billingRuntime.recordUsage({
      workspaceId,
      metric: 'team_member_count',
      quantity: tierId === 'team' ? 8 : 2,
    });
    billingRuntime.flushUsage();
    billingRuntime.generateWorkspaceInvoice({
      workspaceId,
    });
  });
};

export const BillingAdminPanel: React.FC<BillingAdminPanelProps> = ({ userId }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [status, setStatus] = useState('');
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});
  const [isHydrating, setIsHydrating] = useState(false);

  const refresh = () => setRefreshTick((tick) => tick + 1);

  const organizations = useMemo(() => {
    void refreshTick;
    return orgManager.listOrganizationsForUser(userId);
  }, [refreshTick, userId]);
  const organization = organizations[0] ?? null;
  const organizationId = organization?.id ?? '';
  const workspaceScopeKey = organization ? organization.workspaceIds.join('::') : '';

  const persistWorkspaceState = useCallback(
    async (workspaceId: string) => {
      await persistWorkspaceBillingState({
        runtime: billingRuntime,
        userId,
        workspaceId,
      });
    },
    [userId]
  );

  useEffect(() => {
    let active = true;
    if (!organizationId) {
      setIsHydrating(false);
      return () => {
        active = false;
      };
    }
    const scopedWorkspaceIds = organization?.workspaceIds ?? [];
    const scopedOrganizationId = organization.id;

    setIsHydrating(true);
    setStatus('');

    const bootstrap = async () => {
      for (const workspaceId of scopedWorkspaceIds) {
        await hydrateWorkspaceBillingState({
          runtime: billingRuntime,
          userId,
          workspaceId,
        });
      }

      ensureOrgBillingSeed({
        userId,
        organizationId: scopedOrganizationId,
        workspaceIds: scopedWorkspaceIds,
      });

      for (const workspaceId of scopedWorkspaceIds) {
        await persistWorkspaceState(workspaceId);
      }

      if (!active) return;
      setRefreshTick((tick) => tick + 1);
      setIsHydrating(false);
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, [organization, organizationId, persistWorkspaceState, userId, workspaceScopeKey]);

  const snapshot = useMemo(() => {
    void refreshTick;
    if (!organization) return null;

    const summary = billingRuntime.getOrganizationBillingSummary({
      organizationId: organization.id,
    });
    const workspaceCosts = billingRuntime.getWorkspaceCostAttribution({
      organizationId: organization.id,
    });
    return {
      summary,
      workspaceCosts,
    };
  }, [organization, refreshTick]);

  const bootstrapOrg = () => {
    const workspaceIds = [
      `org-${userId}-workspace-core`,
      `org-${userId}-workspace-growth`,
      `org-${userId}-workspace-rnd`,
    ];
    const created = orgManager.createOrganization({
      ownerUserId: userId,
      name: 'Billing Admin Org',
      workspaceIds,
      nowIso: new Date().toISOString(),
    });
    setStatus(`Created org ${created.organization.name}.`);
    refresh();
  };

  const saveBudgetAlert = async (workspaceId: string) => {
    const raw = budgetInputs[workspaceId] ?? '';
    const thresholdUsd = Number(raw);
    if (!Number.isFinite(thresholdUsd) || thresholdUsd <= 0) {
      setStatus(`Invalid budget threshold for ${workspaceId}.`);
      return;
    }
    try {
      await hydrateWorkspaceBillingState({
        runtime: billingRuntime,
        userId,
        workspaceId,
      });
      billingRuntime.ensureWorkspaceAccount({
        workspaceId,
        ownerUserId: userId,
        organizationId: organization?.id,
      });
      billingRuntime.setBudgetAlert({
        workspaceId,
        thresholdUsd,
      });
      await persistWorkspaceState(workspaceId);
      setStatus(`Budget alert set for ${workspaceId} (${asCurrency(thresholdUsd)}).`);
      refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Failed to update budget for ${workspaceId}.`);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className={panelClass}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#e9edef]">Billing Admin Panel</h2>
              <p className="mt-1 text-sm text-[#8ea1ab]">
                Org-level billing health, per-workspace cost attribution, and budget alert controls.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!organization ? (
                <button
                  type="button"
                  className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                  onClick={bootstrapOrg}
                >
                  Create Org
                </button>
              ) : null}
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

        {!organization || !snapshot ? (
          <section className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">
              No organization found for this user. Create one to view billing admin controls.
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Organization</div>
                <div className="mt-1 text-sm text-[#e9edef]">{organization.name}</div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Workspaces</div>
                <div className="mt-1 text-xl text-[#e9edef]">{snapshot.summary.workspaceCount}</div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Active subscriptions</div>
                <div className="mt-1 text-xl text-[#e9edef]">{snapshot.summary.activeSubscriptions}</div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">MRR (estimated)</div>
                <div className="mt-1 text-xl text-[#e9edef]">{asCurrency(snapshot.summary.recurringUsd)}</div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Open invoices</div>
                <div className="mt-1 text-xl text-[#e9edef]">{asCurrency(snapshot.summary.openInvoiceUsd)}</div>
              </article>
            </section>

            <section className={panelClass}>
              <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Per-Workspace Cost Attribution</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">Workspace</th>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">Tier</th>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">Status</th>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">Recurring</th>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">Usage</th>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">Open Invoices</th>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">Budget Alert</th>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.workspaceCosts.map((row) => (
                      <tr key={row.workspaceId}>
                        <td className="px-2 py-1 text-[#dfe7eb]">{row.workspaceId}</td>
                        <td className="px-2 py-1 text-[#9fb0ba]">{row.tierId}</td>
                        <td className="px-2 py-1 text-[#9fb0ba]">{row.subscriptionStatus}</td>
                        <td className="px-2 py-1 text-[#dfe7eb]">{asCurrency(row.recurringUsd)}</td>
                        <td className="px-2 py-1 text-[#dfe7eb]">{asCurrency(row.usageUsd)}</td>
                        <td className="px-2 py-1 text-[#dfe7eb]">{asCurrency(row.openInvoiceUsd)}</td>
                        <td className="px-2 py-1 text-[#9fb0ba]">
                          {row.budgetAlertThresholdUsd
                            ? asCurrency(row.budgetAlertThresholdUsd)
                            : 'Not set'}
                        </td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={budgetInputs[row.workspaceId] ?? ''}
                              onChange={(event) =>
                                setBudgetInputs((prev) => ({
                                  ...prev,
                                  [row.workspaceId]: event.target.value,
                                }))
                              }
                              className="w-24 rounded border border-[#34505f] bg-[#12202a] px-2 py-1 text-[11px] text-[#d7ecf7] outline-none"
                              placeholder="USD"
                            />
                            <button
                              type="button"
                              className="rounded border border-[#4f6f84] px-2 py-1 text-[11px] text-[#bfd8e8] hover:bg-[#1d3140]"
                              onClick={() => void saveBudgetAlert(row.workspaceId)}
                              disabled={isHydrating}
                            >
                              Save
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {status ? (
          <div className="rounded border border-[#31596b] bg-[#102531] px-3 py-2 text-xs text-[#b8dbeb]">
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default BillingAdminPanel;
