import React, { useMemo, useState } from 'react';
import { workflowDeadLetterQueue, workflowEngine, type Workflow, type WorkflowExecution } from '../../workflows';

interface AgentDashboardPanelProps {
  userId: string;
  refreshToken?: number;
  onMutate?: () => void;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const findNextScheduledRunIso = (workflows: ReadonlyArray<Workflow>): string | null => {
  const candidates = workflows
    .filter((workflow) => workflow.trigger.type === 'schedule' && workflow.trigger.enabled)
    .map((workflow) => workflow.trigger.schedule?.nextRunAtIso ?? null)
    .filter((value): value is string => Boolean(value));
  if (candidates.length === 0) return null;
  return candidates.sort((left, right) => Date.parse(left) - Date.parse(right))[0];
};

const summarizeRuns = (executions: ReadonlyArray<WorkflowExecution>) => {
  const total = executions.length;
  const completed = executions.filter((execution) => execution.status === 'completed').length;
  const failed = executions.filter((execution) => execution.status === 'failed').length;
  const blocked = executions.filter(
    (execution) =>
      execution.status === 'approval_required' || execution.status === 'checkpoint_required'
  ).length;
  const successRate = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, failed, blocked, successRate };
};

export const AgentDashboardPanel: React.FC<AgentDashboardPanelProps> = ({
  userId,
  refreshToken = 0,
  onMutate,
}) => {
  const [status, setStatus] = useState('');
  const [isMutating, setIsMutating] = useState(false);

  const workflows = useMemo(() => {
    void refreshToken;
    return workflowEngine.listWorkflows(userId);
  }, [refreshToken, userId]);

  const executions = useMemo(() => {
    void refreshToken;
    return workflowEngine.listExecutions(userId);
  }, [refreshToken, userId]);

  const runSummary = useMemo(() => summarizeRuns(executions), [executions]);
  const nextRunAtIso = useMemo(() => findNextScheduledRunIso(workflows), [workflows]);
  const recentFailures = useMemo(
    () => executions.filter((execution) => execution.status === 'failed').slice(0, 5),
    [executions]
  );
  const deadLetters = useMemo(() => {
    void refreshToken;
    return workflowDeadLetterQueue.list(userId).slice(0, 5);
  }, [refreshToken, userId]);

  const handleMutate = async (action: () => void, message: string) => {
    setIsMutating(true);
    try {
      action();
      setStatus(message);
      onMutate?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Agent dashboard action failed.');
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <section className={panelClass}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#e9edef]">Agent Dashboard</h3>
          <p className="text-xs text-[#8ea1ab]">
            Track active plans, run reliability, and failed background jobs.
          </p>
        </div>
        <div className="text-xs text-[#8ea1ab]">
          Next scheduled:{' '}
          {nextRunAtIso ? new Date(nextRunAtIso).toLocaleString() : 'No scheduled workflows'}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
          <div className="text-[#8ea1ab]">Workflows</div>
          <div className="mt-1 text-base text-[#e9edef]">{workflows.length}</div>
        </div>
        <div className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
          <div className="text-[#8ea1ab]">Runs (30d)</div>
          <div className="mt-1 text-base text-[#e9edef]">{runSummary.total}</div>
        </div>
        <div className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
          <div className="text-[#8ea1ab]">Success rate</div>
          <div className="mt-1 text-base text-[#e9edef]">{runSummary.successRate}%</div>
        </div>
        <div className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
          <div className="text-[#8ea1ab]">Dead letters</div>
          <div className="mt-1 text-base text-[#e9edef]">{deadLetters.length}</div>
        </div>
      </div>

      <div className="mt-3 rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
        <div className="font-medium text-[#dce5ea]">
          Completed: {runSummary.completed} • Failed: {runSummary.failed} • Needs review:{' '}
          {runSummary.blocked}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-[#8ea1ab]">Workflow controls</div>
          <div className="space-y-2">
            {workflows.slice(0, 8).map((workflow) => (
              <div key={workflow.id} className="rounded border border-[#1f2c34] bg-[#0d151a] p-2 text-xs">
                <div className="text-[#e9edef]">{workflow.name}</div>
                <div className="mt-1 text-[11px] text-[#8ea1ab]">
                  status={workflow.status} • trigger={workflow.trigger.type}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isMutating || workflow.status === 'paused'}
                    className="rounded border border-[#4e6877] px-2 py-1 text-[11px] text-[#c5d8e1] hover:bg-[#1c2b33] disabled:opacity-60"
                    onClick={() => {
                      void handleMutate(
                        () =>
                          workflowEngine.pauseWorkflow({
                            userId,
                            workflowId: workflow.id,
                          }),
                        `Paused workflow ${workflow.name}.`
                      );
                    }}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    disabled={isMutating || workflow.status !== 'paused'}
                    className="rounded border border-[#2f5f49] px-2 py-1 text-[11px] text-[#afe8c5] hover:bg-[#143227] disabled:opacity-60"
                    onClick={() => {
                      void handleMutate(
                        () =>
                          workflowEngine.resumeWorkflow({
                            userId,
                            workflowId: workflow.id,
                          }),
                        `Resumed workflow ${workflow.name}.`
                      );
                    }}
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    disabled={isMutating}
                    className="rounded border border-[#6e4a4a] px-2 py-1 text-[11px] text-[#f0c8c8] hover:bg-[#331f22] disabled:opacity-60"
                    onClick={() => {
                      void handleMutate(
                        () =>
                          workflowEngine.cancelWorkflow({
                            userId,
                            workflowId: workflow.id,
                            reason: 'Cancelled from agent dashboard.',
                          }),
                        `Cancelled workflow ${workflow.name}.`
                      );
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[#546c7a] px-2 py-1 text-[11px] text-[#bdd1db] hover:bg-[#1c2b33]"
                    onClick={() => {
                      const history = executions
                        .filter((execution) => execution.workflowId === workflow.id)
                        .slice(0, 3);
                      if (history.length === 0) {
                        setStatus(`No execution history for ${workflow.name}.`);
                        return;
                      }
                      setStatus(
                        `Recent ${workflow.name} runs: ${history
                          .map(
                            (execution) =>
                              `${execution.status} @ ${new Date(
                                execution.finishedAtIso
                              ).toLocaleString()}`
                          )
                          .join(' | ')}`
                      );
                    }}
                  >
                    View History
                  </button>
                </div>
              </div>
            ))}
            {workflows.length === 0 ? (
              <div className="rounded border border-[#2d3942] bg-[#0d151a] p-2 text-xs text-[#8ea1ab]">
                No workflows created yet.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-[#8ea1ab]">
            Recent failures / dead letters
          </div>
          <div className="space-y-2">
            {recentFailures.map((execution) => (
              <div key={execution.id} className="rounded border border-[#4e3232] bg-[#211315] p-2 text-xs">
                <div className="text-[#f4d1d1]">
                  {execution.workflowId} failed at {new Date(execution.finishedAtIso).toLocaleString()}
                </div>
                <div className="mt-1 text-[11px] text-[#ddb0b0]">
                  {execution.stepResults[execution.stepResults.length - 1]?.outputSummary ?? 'No summary'}
                </div>
              </div>
            ))}
            {deadLetters.map((entry) => (
              <div key={entry.id} className="rounded border border-[#4e3232] bg-[#211315] p-2 text-xs">
                <div className="text-[#f4d1d1]">
                  DLQ • {entry.workflowId} • {entry.status}
                </div>
                <div className="mt-1 text-[11px] text-[#ddb0b0]">{entry.reason}</div>
                <button
                  type="button"
                  className="mt-2 rounded border border-[#6e4a4a] px-2 py-1 text-[11px] text-[#f0c8c8] hover:bg-[#331f22]"
                  onClick={() => {
                    workflowDeadLetterQueue.markResolved({
                      userId,
                      entryId: entry.id,
                    });
                    setStatus(`Marked DLQ entry ${entry.id} as resolved.`);
                    onMutate?.();
                  }}
                >
                  Mark Resolved
                </button>
              </div>
            ))}
            {recentFailures.length === 0 && deadLetters.length === 0 ? (
              <div className="rounded border border-[#2d3942] bg-[#0d151a] p-2 text-xs text-[#8ea1ab]">
                No recent failures.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {status ? (
        <div className="mt-3 rounded border border-[#2d3942] bg-[#0d151a] px-3 py-2 text-xs text-[#aebec8]">
          {status}
        </div>
      ) : null}
    </section>
  );
};

export default AgentDashboardPanel;
