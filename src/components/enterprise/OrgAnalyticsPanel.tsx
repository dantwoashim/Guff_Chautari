import React, { useState } from 'react';
import { generateEnterpriseAnalytics, orgManager } from '../../enterprise';

interface OrgAnalyticsPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const rangeToDays = (range: '7d' | '30d' | '90d'): number => {
  if (range === '7d') return 7;
  if (range === '90d') return 90;
  return 30;
};

const toCsv = (rows: ReadonlyArray<Record<string, string | number>>): string => {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      headers
        .map((header) => {
          const value = String(row[header] ?? '');
          if (value.includes(',') || value.includes('"')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(',')
    );
  }
  return lines.join('\n');
};

export const OrgAnalyticsPanel: React.FC<OrgAnalyticsPanelProps> = ({ userId }) => {
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [refreshTick, setRefreshTick] = useState(0);
  const [status, setStatus] = useState('');

  const organizations = orgManager.listOrganizationsForUser(userId);

  const organization = organizations[0] ?? null;

  const report = (() => {
    if (!organization) return null;

    try {
      return generateEnterpriseAnalytics({
        organizationId: organization.id,
        actorUserId: userId,
        rangeDays: rangeToDays(range),
      });
    } catch {
      return null;
    }
  })();

  const exportCsv = () => {
    if (!report) return;

    const csv = toCsv(
      report.workspaces.map((row) => ({
        workspace_id: row.workspaceId,
        active_users_daily: row.activeUsersDaily,
        active_users_weekly: row.activeUsersWeekly,
        active_users_monthly: row.activeUsersMonthly,
        workflow_runs: row.workflowRuns,
        workflow_success_rate: row.workflowSuccessRate,
        api_calls: row.apiCalls,
        knowledge_sources: row.knowledgeSources,
      }))
    );

    if (!csv) {
      setStatus('No rows available for CSV export.');
      return;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `enterprise-analytics-${range}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatus('Exported CSV.');
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className={panelClass}>
          <h2 className="text-lg font-semibold text-[#e9edef]">Org Analytics</h2>
          <p className="mt-1 text-sm text-[#8ea1ab]">
            Org-level engagement, workflow reliability, connector usage, and knowledge growth.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['7d', '30d', '90d'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`rounded border px-3 py-2 text-xs ${
                  range === option
                    ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                    : 'border-[#4f6f84] text-[#bfd8e8] hover:bg-[#1d3140]'
                }`}
                onClick={() => setRange(option)}
              >
                {option}
              </button>
            ))}
            <button
              type="button"
              className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
              onClick={() => setRefreshTick((tick) => tick + 1)}
            >
              Refresh
            </button>
            <button
              type="button"
              className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
              onClick={exportCsv}
            >
              Export CSV
            </button>
          </div>
        </header>

        {!organization ? (
          <section className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">No organization found for this user.</div>
          </section>
        ) : !report ? (
          <section className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">Analytics unavailable for the selected organization.</div>
          </section>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Weekly active users</div>
                <div className="mt-1 text-xl text-[#e9edef]">{report.totals.activeUsersWeekly}</div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Workflow runs</div>
                <div className="mt-1 text-xl text-[#e9edef]">{report.totals.workflowRuns}</div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">API calls</div>
                <div className="mt-1 text-xl text-[#e9edef]">{report.totals.apiCalls}</div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Knowledge/day</div>
                <div className="mt-1 text-xl text-[#e9edef]">{report.totals.knowledgeGrowthRate}</div>
              </article>
            </section>

            <section className={panelClass}>
              <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Workspace Analytics</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">Workspace</th>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">DAU</th>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">WAU</th>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">MAU</th>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">Runs</th>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">Success</th>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">API</th>
                      <th className="px-2 py-1 text-left text-[#8ea1ab]">Knowledge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.workspaces.map((row) => (
                      <tr key={row.workspaceId}>
                        <td className="px-2 py-1 text-[#dfe7eb]">{row.workspaceId}</td>
                        <td className="px-2 py-1 text-[#9fb0ba]">{row.activeUsersDaily}</td>
                        <td className="px-2 py-1 text-[#9fb0ba]">{row.activeUsersWeekly}</td>
                        <td className="px-2 py-1 text-[#9fb0ba]">{row.activeUsersMonthly}</td>
                        <td className="px-2 py-1 text-[#9fb0ba]">{row.workflowRuns}</td>
                        <td className="px-2 py-1 text-[#9fb0ba]">{Math.round(row.workflowSuccessRate * 100)}%</td>
                        <td className="px-2 py-1 text-[#9fb0ba]">{row.apiCalls}</td>
                        <td className="px-2 py-1 text-[#9fb0ba]">{row.knowledgeSources}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={panelClass}>
              <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Most Used Connectors</h3>
              {report.mostUsedConnectors.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-xs text-[#8ea1ab]">
                  No connector usage signal yet.
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  {report.mostUsedConnectors.map((connector) => (
                    <div key={connector.connectorId} className="rounded border border-[#2d3942] bg-[#0d151a] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#e9edef]">{connector.connectorId}</span>
                        <span className="text-[#8ea1ab]">{connector.uses} use(s)</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {status ? (
          <div className="rounded border border-[#2d3942] bg-[#0d151a] px-3 py-2 text-xs text-[#aebec8]">{status}</div>
        ) : null}
      </div>
    </div>
  );
};

export default OrgAnalyticsPanel;
