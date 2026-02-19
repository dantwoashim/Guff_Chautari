import React, { useMemo, useState } from 'react';
import { autonomyGuardrails, autonomyPlanEngine, type AutonomousPlan } from '../../autonomy';

interface AutonomyMonitorPanelProps {
  userId: string;
  workspaceId?: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const summarizePlanProgress = (plan: AutonomousPlan): string => {
  const total = plan.tasks.length;
  const completed = plan.tasks.filter((task) => task.status === 'completed').length;
  const blocked = plan.tasks.filter((task) => task.status === 'approval_required').length;
  const failed = plan.tasks.filter((task) => task.status === 'failed').length;
  return `${completed}/${total} complete • blocked ${blocked} • failed ${failed}`;
};

export const AutonomyMonitorPanel: React.FC<AutonomyMonitorPanelProps> = ({
  userId,
  workspaceId = `workspace-${userId}`,
}) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [status, setStatus] = useState('');

  const plans = useMemo(() => {
    void refreshTick;
    return autonomyPlanEngine.listPlans({
      userId,
      workspaceId,
    });
  }, [refreshTick, userId, workspaceId]);

  const activePlans = useMemo(() => {
    return plans.filter((plan) => plan.status === 'active' || plan.status === 'paused');
  }, [plans]);

  const escalations = useMemo(() => {
    void refreshTick;
    return autonomyGuardrails.listEscalations({ status: 'pending' });
  }, [refreshTick]);

  const recentReports = useMemo(() => {
    return plans
      .flatMap((plan) =>
        plan.reports.map((report) => ({
          ...report,
          planGoal: plan.goal,
        }))
      )
      .sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso))
      .slice(0, 12);
  }, [plans]);

  const createDemoPlan = () => {
    const created = autonomyPlanEngine.createPlan({
      userId,
      workspaceId,
      goal: 'Prepare Monday leadership update',
      durationDays: 5,
      seedTasksByDay: [
        [{ title: 'Collect source notes', description: 'Gather progress updates and blockers.' }],
        [{ title: 'Draft narrative', description: 'Compose concise update narrative.' }],
        [{ title: 'Pressure test assumptions', description: 'Run risk and downside checks.' }],
        [{ title: 'Finalize deck', description: 'Produce briefing slides and speaking points.' }],
        [{ title: 'Deliver update', description: 'Share final update and collect action items.' }],
      ],
    });
    setStatus(`Created plan "${created.goal}".`);
    setRefreshTick((tick) => tick + 1);
  };

  const runNextDay = async (plan: AutonomousPlan) => {
    try {
      const result = await autonomyPlanEngine.executeDay({
        planId: plan.id,
        dayIndex: plan.currentDayIndex,
      });
      setStatus(result.report.summary);
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to execute day.');
    }
  };

  const handleEscalationDecision = (escalationId: string, decision: 'approve' | 'reject') => {
    try {
      autonomyGuardrails.resolveEscalation({
        escalationId,
        decision,
        reviewerUserId: userId,
      });
      setStatus(`Escalation ${decision}d.`);
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to resolve escalation.');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#e9edef]">Autonomy Monitor</h2>
              <p className="mt-1 text-sm text-[#9fb0b8]">
                Monitor active autonomous plans, guardrail escalations, and daily execution history.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-[#3f6d80] px-3 py-1.5 text-xs text-[#b8dced] hover:bg-[#1d3f4d]"
                onClick={createDemoPlan}
              >
                Create Demo Plan
              </button>
              {autonomyGuardrails.isKillSwitchActive() ? (
                <button
                  type="button"
                  className="rounded border border-[#6b5d27] px-3 py-1.5 text-xs text-[#ecdca4] hover:bg-[#3a3116]"
                  onClick={() => {
                    autonomyGuardrails.clearKillSwitch();
                    setStatus('Kill switch cleared.');
                    setRefreshTick((tick) => tick + 1);
                  }}
                >
                  Clear Kill Switch
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded border border-[#7d4545] px-3 py-1.5 text-xs text-[#f3c7c7] hover:bg-[#3a1d1d]"
                  onClick={() => {
                    autonomyGuardrails.activateKillSwitch('operator halt');
                    setStatus('Kill switch activated.');
                    setRefreshTick((tick) => tick + 1);
                  }}
                >
                  Activate Kill Switch
                </button>
              )}
            </div>
          </div>
        </section>

        <section className={panelClass}>
          <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Active Plans</h3>
          {activePlans.length === 0 ? (
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              No active autonomous plans.
            </div>
          ) : (
            <div className="space-y-2">
              {activePlans.map((plan) => (
                <div key={plan.id} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm text-[#e9edef]">{plan.goal}</div>
                      <div className="text-[#8ea1ab]">
                        {plan.status} • day {plan.currentDayIndex + 1}/{plan.durationDays}
                      </div>
                      <div className="mt-1 text-[#a9bac3]">{summarizePlanProgress(plan)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded border border-[#3a6072] px-2 py-1 text-[11px] text-[#b9dbe9] hover:bg-[#1a2f39]"
                        onClick={() => {
                          void runNextDay(plan);
                        }}
                      >
                        Run Day
                      </button>
                      <button
                        type="button"
                        className="rounded border border-[#6f6240] px-2 py-1 text-[11px] text-[#eadbae] hover:bg-[#322a15]"
                        onClick={() => {
                          try {
                            const resumed = autonomyPlanEngine.resumePlan(plan.id);
                            setStatus(`Plan status: ${resumed.status}.`);
                            setRefreshTick((tick) => tick + 1);
                          } catch (error) {
                            setStatus(error instanceof Error ? error.message : 'Resume failed.');
                          }
                        }}
                      >
                        Resume
                      </button>
                      <button
                        type="button"
                        className="rounded border border-[#7d4545] px-2 py-1 text-[11px] text-[#f3c7c7] hover:bg-[#3a1d1d]"
                        onClick={() => {
                          autonomyPlanEngine.haltPlan(plan.id, 'Stopped from monitor panel.');
                          setStatus('Plan halted.');
                          setRefreshTick((tick) => tick + 1);
                        }}
                      >
                        Halt
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    <div className="rounded border border-[#2b3a43] bg-[#0d151a] px-2 py-1">
                      tokens {plan.usage.tokensUsed}
                    </div>
                    <div className="rounded border border-[#2b3a43] bg-[#0d151a] px-2 py-1">
                      api {plan.usage.apiCalls}
                    </div>
                    <div className="rounded border border-[#2b3a43] bg-[#0d151a] px-2 py-1">
                      connectors {plan.usage.connectorActions}
                    </div>
                    <div className="rounded border border-[#2b3a43] bg-[#0d151a] px-2 py-1">
                      runtime {plan.usage.runtimeMinutes}m
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={panelClass}>
          <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Escalation Queue</h3>
          {escalations.length === 0 ? (
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              No pending escalations.
            </div>
          ) : (
            <div className="space-y-2">
              {escalations.map((escalation) => (
                <div key={escalation.id} className="rounded border border-[#6f5328] bg-[#251d0f] p-3 text-xs">
                  <div className="text-[#f0deb0]">
                    {escalation.type} • {escalation.reason}
                  </div>
                  <div className="mt-1 text-[#d9bf84]">plan {escalation.planId}</div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded border border-[#3a7458] px-2 py-1 text-[11px] text-[#c4eed9] hover:bg-[#163528]"
                      onClick={() => handleEscalationDecision(escalation.id, 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="rounded border border-[#7d4545] px-2 py-1 text-[11px] text-[#f3c7c7] hover:bg-[#3a1d1d]"
                      onClick={() => handleEscalationDecision(escalation.id, 'reject')}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={panelClass}>
          <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Execution History</h3>
          {recentReports.length === 0 ? (
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              No execution reports yet.
            </div>
          ) : (
            <div className="space-y-2">
              {recentReports.map((report) => (
                <div key={report.id} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                  <div className="text-[#e9edef]">{report.planGoal}</div>
                  <div className="mt-1 text-[#8ea1ab]">
                    day {report.dayIndex + 1} • {new Date(report.createdAtIso).toLocaleString()}
                  </div>
                  <div className="mt-1 text-[#b7c6ce]">{report.summary}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {status ? (
          <section className="rounded-xl border border-[#2d3942] bg-[#0d151a] px-4 py-3 text-xs text-[#aebec8]">
            {status}
          </section>
        ) : null}
      </div>
    </div>
  );
};

export default AutonomyMonitorPanel;
