import React, { useEffect, useMemo, useState } from 'react';
import { generateTeamWeeklyBriefing, type TeamWeeklyBriefing } from '../../team/briefingGenerator';
import { workspaceManager } from '../../team/workspaceManager';

interface TeamDashboardPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const formatTimestamp = (iso: string): string => {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString();
};

const intensityClass = (value: number, max: number): string => {
  if (max <= 0 || value <= 0) return 'bg-[#1a242b]';
  const ratio = value / max;
  if (ratio >= 0.8) return 'bg-[#00a884]';
  if (ratio >= 0.55) return 'bg-[#169676]';
  if (ratio >= 0.3) return 'bg-[#256f66]';
  return 'bg-[#2c4f56]';
};

export const TeamDashboardPanel: React.FC<TeamDashboardPanelProps> = ({ userId }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [workspaceNameInput, setWorkspaceNameInput] = useState('Team Workspace');
  const [status, setStatus] = useState('');
  const [briefing, setBriefing] = useState<TeamWeeklyBriefing | null>(null);

  const refresh = () => setRefreshTick((tick) => tick + 1);

  const workspaces = useMemo(() => {
    void refreshTick;
    return workspaceManager.listWorkspacesForUser(userId);
  }, [refreshTick, userId]);

  useEffect(() => {
    if (!selectedWorkspaceId && workspaces.length > 0) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
  }, [selectedWorkspaceId, workspaces]);

  const activeWorkspace = useMemo(() => {
    if (!selectedWorkspaceId) return null;
    return workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  }, [selectedWorkspaceId, workspaces]);

  useEffect(() => {
    if (!activeWorkspace) {
      setBriefing(null);
      return;
    }
    try {
      const nextBriefing = generateTeamWeeklyBriefing({
        workspaceId: activeWorkspace.id,
        actorUserId: userId,
        weeks: 2,
      });
      setBriefing(nextBriefing);
    } catch (error) {
      setBriefing(null);
      setStatus(error instanceof Error ? error.message : 'Failed to generate team briefing.');
    }
  }, [activeWorkspace, refreshTick, userId]);

  const maxHeatValue = useMemo(() => {
    if (!briefing) return 0;
    return Math.max(0, ...briefing.heatmap.rows.flatMap((row) => row.counts));
  }, [briefing]);

  const handleCreateWorkspace = () => {
    const name = workspaceNameInput.trim();
    if (!name) {
      setStatus('Workspace name is required.');
      return;
    }
    const created = workspaceManager.createWorkspace({
      ownerUserId: userId,
      name,
    });
    setSelectedWorkspaceId(created.workspace.id);
    setStatus(`Created workspace "${created.workspace.name}".`);
    refresh();
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Team Dashboard</h2>
            <p className="text-sm text-[#8696a0]">
              Workspace intelligence view across activity, workflows, knowledge, and weekly team briefing.
            </p>
          </div>
          <button
            type="button"
            className="rounded border border-[#4f6f84] px-3 py-1.5 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
            onClick={refresh}
          >
            Refresh
          </button>
        </div>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Workspace</h3>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <div className="flex gap-2">
              <select
                value={selectedWorkspaceId ?? ''}
                onChange={(event) => setSelectedWorkspaceId(event.target.value || null)}
                className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
              >
                {workspaces.length === 0 ? <option value="">No workspace yet</option> : null}
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              <input
                value={workspaceNameInput}
                onChange={(event) => setWorkspaceNameInput(event.target.value)}
                placeholder="New workspace name"
                className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
              />
            </div>
            <button
              type="button"
              className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
              onClick={handleCreateWorkspace}
            >
              Create Workspace
            </button>
          </div>
        </section>

        {briefing ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Members</div>
                <div className="mt-1 text-xl text-[#e9edef]">{briefing.memberActivity.length}</div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Active Workflows</div>
                <div className="mt-1 text-xl text-[#e9edef]">{briefing.workflowSummary.activeWorkflows}</div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Scheduled Tasks</div>
                <div className="mt-1 text-xl text-[#e9edef]">
                  {briefing.workflowSummary.upcomingScheduledTasks}
                </div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Key Decisions</div>
                <div className="mt-1 text-xl text-[#e9edef]">{briefing.keyDecisions.length}</div>
              </article>
            </section>

            <div className="grid gap-4 xl:grid-cols-3">
              <section className={`${panelClass} xl:col-span-2`}>
                <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Member Activity Heatmap</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="px-2 py-1 text-left text-[#8ea1ab]">Member</th>
                        <th className="px-2 py-1 text-left text-[#8ea1ab]">Role</th>
                        {briefing.heatmap.dayLabels.map((label, index) => (
                          <th key={`${label}-${index}`} className="px-1 py-1 text-center text-[#6f838d]">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {briefing.heatmap.rows.map((row) => (
                        <tr key={row.userId}>
                          <td className="px-2 py-1 text-[#dfe7eb]">{row.userId}</td>
                          <td className="px-2 py-1 text-[#9bb0ba]">{row.role}</td>
                          {row.counts.map((count, index) => (
                            <td key={`${row.userId}-${index}`} className="px-1 py-1 text-center">
                              <div
                                title={`${count} event(s)`}
                                className={`mx-auto h-5 w-5 rounded ${intensityClass(count, maxHeatValue)}`}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={panelClass}>
                <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Latest Briefing</h3>
                <div className="text-xs text-[#8ea1ab]">{briefing.summary}</div>
                <div className="mt-2 text-[11px] text-[#70868f]">
                  Generated: {formatTimestamp(briefing.generatedAtIso)}
                </div>
                <div className="mt-3 space-y-1">
                  {briefing.highlights.slice(0, 4).map((item, index) => (
                    <div key={`highlight-${index}`} className="rounded border border-[#2d3942] bg-[#0d151a] p-2 text-xs">
                      {item}
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className={panelClass}>
                <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Recent Knowledge Additions</h3>
                <div className="space-y-2">
                  {briefing.recentKnowledgeAdditions.length === 0 ? (
                    <div className="rounded border border-[#2d3942] bg-[#0d151a] p-2 text-xs text-[#8ea1ab]">
                      No knowledge additions in selected window.
                    </div>
                  ) : (
                    briefing.recentKnowledgeAdditions.slice(0, 8).map((item) => (
                      <article key={`${item.userId}-${item.sourceId}`} className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
                        <div className="text-[#e9edef]">{item.title}</div>
                        <div className="mt-1 text-[11px] text-[#8ea1ab]">
                          {item.sourceType} • by {item.userId}
                        </div>
                        <div className="mt-1 text-[11px] text-[#6f838d]">{formatTimestamp(item.createdAtIso)}</div>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className={panelClass}>
                <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Upcoming Scheduled Tasks</h3>
                <div className="space-y-2">
                  {briefing.upcomingScheduledTasks.length === 0 ? (
                    <div className="rounded border border-[#2d3942] bg-[#0d151a] p-2 text-xs text-[#8ea1ab]">
                      No upcoming scheduled workflow tasks.
                    </div>
                  ) : (
                    briefing.upcomingScheduledTasks.slice(0, 8).map((task) => (
                      <article key={`${task.userId}-${task.workflowId}`} className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
                        <div className="text-[#e9edef]">{task.workflowName}</div>
                        <div className="mt-1 text-[11px] text-[#8ea1ab]">
                          owner: {task.userId} • workflow: {task.workflowId}
                        </div>
                        <div className="mt-1 text-[11px] text-[#6f838d]">
                          next run: {formatTimestamp(task.nextRunAtIso)}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          </>
        ) : (
          <section className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">
              Select or create a workspace to generate team dashboard metrics.
            </div>
          </section>
        )}

        {status ? (
          <div className="rounded border border-[#2d3942] bg-[#0d151a] px-3 py-2 text-xs text-[#aebec8]">
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TeamDashboardPanel;

