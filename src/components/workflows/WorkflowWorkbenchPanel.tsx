import React, { useEffect, useMemo, useState } from 'react';
import { emitActivityEvent } from '../../activity';
import { connectorRegistry, type ConnectorHealthStatus } from '../../connectors';
import { ApprovalQueuePanel } from '../policy/ApprovalQueuePanel';
import { PlanEditorPanel } from './PlanEditorPanel';
import { CheckpointReviewPanel } from './CheckpointReviewPanel';
import { AgentDashboardPanel } from './AgentDashboardPanel';
import {
  workflowBackgroundRunner,
  workflowEngine,
  WorkflowTriggerManager,
  type WorkflowChangeEntry,
  type Workflow,
} from '../../workflows';

interface WorkflowWorkbenchPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

export const WorkflowWorkbenchPanel: React.FC<WorkflowWorkbenchPanelProps> = ({ userId }) => {
  const [prompt, setPrompt] = useState('Summarize my emails every morning');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [heartbeatAtIso, setHeartbeatAtIso] = useState<string | null>(null);
  const [eventText, setEventText] = useState('invoice posted in latest message');
  const [refreshTick, setRefreshTick] = useState(0);
  const [triggerManager] = useState(() => new WorkflowTriggerManager());
  const [activeToastNotificationId, setActiveToastNotificationId] = useState<string | null>(null);
  const [seenToastNotificationIds, setSeenToastNotificationIds] = useState<string[]>([]);
  const [connectorTokens, setConnectorTokens] = useState<Record<string, string>>({});
  const [connectorHealthStatuses, setConnectorHealthStatuses] = useState<ConnectorHealthStatus[]>([]);
  const [isCheckingConnectorHealth, setIsCheckingConnectorHealth] = useState(false);

  const workflows = useMemo(() => {
    void refreshTick;
    return workflowEngine.listWorkflows(userId);
  }, [refreshTick, userId]);

  const selectedWorkflow = useMemo<Workflow | null>(() => {
    if (workflows.length === 0) return null;
    if (!selectedWorkflowId) return workflows[0];
    return workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? workflows[0];
  }, [selectedWorkflowId, workflows]);

  const availableConnectors = useMemo(() => connectorRegistry.list(), []);

  const executions = useMemo(() => {
    void refreshTick;
    return selectedWorkflow ? workflowEngine.listExecutions(userId, selectedWorkflow.id) : [];
  }, [refreshTick, selectedWorkflow, userId]);

  const artifacts = useMemo(() => {
    void refreshTick;
    return workflowEngine.listArtifacts(userId).slice(0, 8);
  }, [refreshTick, userId]);

  const notifications = useMemo(() => {
    void refreshTick;
    return workflowEngine.listNotifications(userId).slice(0, 8);
  }, [refreshTick, userId]);

  const approvals = useMemo(() => {
    void refreshTick;
    return workflowEngine.listPendingApprovals();
  }, [refreshTick]);

  const checkpoints = useMemo(() => {
    void refreshTick;
    return workflowEngine.listPendingCheckpoints(userId).slice(0, 8);
  }, [refreshTick, userId]);

  const workflowChangeEntries = useMemo(() => {
    void refreshTick;
    if (!selectedWorkflow) return [] as WorkflowChangeEntry[];
    return workflowEngine.listChangeHistory({
      userId,
      workflowId: selectedWorkflow.id,
      limit: 12,
    });
  }, [refreshTick, selectedWorkflow, userId]);

  const workflowChangeDiff = useMemo(() => {
    if (workflowChangeEntries.length < 2) return null;
    const newest = workflowChangeEntries[0];
    const oldest = workflowChangeEntries[workflowChangeEntries.length - 1];
    return workflowEngine.diffChangeEntries({
      left: oldest,
      right: newest,
    });
  }, [workflowChangeEntries]);

  const connectorHealthById = useMemo(() => {
    return new Map(connectorHealthStatuses.map((status) => [status.connectorId, status]));
  }, [connectorHealthStatuses]);

  const latestExecution = useMemo(() => {
    return executions[0] ?? null;
  }, [executions]);

  const latestStepResult = useMemo(() => {
    if (!latestExecution) return null;
    return latestExecution.stepResults[latestExecution.stepResults.length - 1] ?? null;
  }, [latestExecution]);

  const activeToast = useMemo(() => {
    if (!activeToastNotificationId) return null;
    return notifications.find((notification) => notification.id === activeToastNotificationId) ?? null;
  }, [activeToastNotificationId, notifications]);

  useEffect(() => {
    const unregisters = workflows
      .filter((workflow) => workflow.trigger.enabled && workflow.trigger.type !== 'manual')
      .map((workflow) =>
        triggerManager.register(workflow, async (candidate, trigger) => {
          await workflowEngine.runWorkflowById({
            userId,
            workflowId: candidate.id,
            triggerType: trigger.type,
          });
          setRefreshTick((tick) => tick + 1);
        })
      );

    const interval = setInterval(() => {
      void triggerManager.tick();
    }, 1000);

    return () => {
      clearInterval(interval);
      unregisters.forEach((unsubscribe) => unsubscribe());
    };
  }, [triggerManager, userId, workflows]);

  useEffect(() => {
    const unread = notifications.find(
      (notification) => !notification.read && !seenToastNotificationIds.includes(notification.id)
    );
    if (!unread || unread.id === activeToastNotificationId) return;

    setActiveToastNotificationId(unread.id);
    setSeenToastNotificationIds((current) =>
      current.includes(unread.id) ? current : [...current, unread.id]
    );
    const timer = window.setTimeout(() => {
      setActiveToastNotificationId((current) => (current === unread.id ? null : current));
    }, 4500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeToastNotificationId, notifications, seenToastNotificationIds]);

  useEffect(() => {
    void (async () => {
      try {
        const statuses = await connectorRegistry.checkAllConnectorHealth({
          userId,
          tokensByConnectorId: {},
        });
        setConnectorHealthStatuses(statuses);
      } catch {
        // Connector panel can still render without initial health snapshots.
      }
    })();
  }, [userId]);

  const handleCreateWorkflow = () => {
    if (!prompt.trim()) {
      setStatus('Workflow prompt is required.');
      return;
    }

    try {
      const workflow = workflowEngine.createFromPrompt({
        userId,
        prompt: prompt.trim(),
      });
      setSelectedWorkflowId(workflow.id);
      setRefreshTick((tick) => tick + 1);
      emitActivityEvent({
        userId,
        category: 'workflow',
        eventType: 'workflow.created',
        title: 'Workflow created',
        description: `Created workflow "${workflow.name}" with ${workflow.steps.length} step(s).`,
      });
      setStatus(`Created workflow "${workflow.name}" with ${workflow.steps.length} step(s).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to create workflow.');
    }
  };

  const runConnectorHealthChecks = async () => {
    setIsCheckingConnectorHealth(true);
    try {
      const statuses = await connectorRegistry.checkAllConnectorHealth({
        userId,
        tokensByConnectorId: connectorTokens,
      });
      setConnectorHealthStatuses(statuses);
      setStatus(`Connector health checks completed (${statuses.length} connector(s)).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Connector health check failed.');
    } finally {
      setIsCheckingConnectorHealth(false);
    }
  };

  const upsertConnectorHealthStatus = (nextStatus: ConnectorHealthStatus): void => {
    setConnectorHealthStatuses((current) => {
      const map = new Map<string, ConnectorHealthStatus>(
        current.map((status) => [status.connectorId, status] as const)
      );
      map.set(nextStatus.connectorId, nextStatus);
      return Array.from(map.values()).sort((left, right) =>
        left.connectorId.localeCompare(right.connectorId)
      );
    });
  };

  const handleRunWorkflow = async () => {
    if (!selectedWorkflow) {
      setStatus('Create or select a workflow first.');
      return;
    }

    setIsRunning(true);
    try {
      const execution = await workflowEngine.runWorkflowById({
        userId,
        workflowId: selectedWorkflow.id,
        triggerType: 'manual',
      });
      emitActivityEvent({
        userId,
        category: 'workflow',
        eventType: 'workflow.run_completed',
        title: 'Workflow run completed',
        description: `${selectedWorkflow.name} finished with status ${execution.status}.`,
      });
      setStatus(
        `Workflow finished with status "${execution.status}" in ${execution.durationMs}ms.`
      );
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Workflow execution failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunBackground = async () => {
    if (!selectedWorkflow) {
      setStatus('Create or select a workflow first.');
      return;
    }

    setIsRunning(true);
    setHeartbeatAtIso(null);
    try {
      const execution = await workflowBackgroundRunner.runInBackground({
        userId,
        workflowId: selectedWorkflow.id,
        triggerType: 'manual',
        onHeartbeat: setHeartbeatAtIso,
      });
      emitActivityEvent({
        userId,
        category: 'workflow',
        eventType: 'workflow.background_completed',
        title: 'Background workflow completed',
        description: `${selectedWorkflow.name} completed in background with status ${execution.status}.`,
      });
      setStatus(
        `Background run completed with status "${execution.status}" in ${execution.durationMs}ms.`
      );
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Background run failed.');
      setRefreshTick((tick) => tick + 1);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunStep = async (stepId: string) => {
    if (!selectedWorkflow) return;
    setIsRunning(true);
    try {
      const execution = await workflowEngine.runStepById({
        userId,
        workflowId: selectedWorkflow.id,
        stepId,
      });
      emitActivityEvent({
        userId,
        category: 'workflow',
        eventType: 'workflow.step_executed',
        title: 'Workflow step executed',
        description: `Step ${stepId} finished with status ${execution.status}.`,
      });
      setStatus(`Step run finished with status "${execution.status}".`);
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Step execution failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleDispatchKeywordEvent = async () => {
    await triggerManager.dispatchEvent({
      type: 'keyword_match',
      text: eventText,
    });
    setRefreshTick((tick) => tick + 1);
    emitActivityEvent({
      userId,
      category: 'workflow',
      eventType: 'workflow.keyword_event_dispatched',
      title: 'Workflow event dispatched',
      description: `Dispatched keyword event: "${eventText}".`,
    });
    setStatus('Keyword event dispatched to matching workflows.');
  };

  const handleApprove = (requestId: string) => {
    if (!selectedWorkflow) return;
    workflowEngine.resolveApproval({
      requestId,
      reviewerUserId: userId,
      approve: true,
    });
    emitActivityEvent({
      userId,
      category: 'workflow',
      eventType: 'workflow.approval_granted',
      title: 'Workflow approval granted',
      description: `Approval request ${requestId} was approved.`,
    });
    setRefreshTick((tick) => tick + 1);
  };

  const handleReject = (requestId: string) => {
    if (!selectedWorkflow) return;
    workflowEngine.resolveApproval({
      requestId,
      reviewerUserId: userId,
      approve: false,
    });
    emitActivityEvent({
      userId,
      category: 'workflow',
      eventType: 'workflow.approval_rejected',
      title: 'Workflow approval rejected',
      description: `Approval request ${requestId} was rejected.`,
    });
    setRefreshTick((tick) => tick + 1);
  };

  const handleSavePlanGraph = (nextWorkflow: Workflow) => {
    try {
      workflowEngine.saveWorkflow(userId, nextWorkflow);
      setStatus(`Saved plan graph for "${nextWorkflow.name}".`);
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save workflow plan graph.');
    }
  };

  const handleCheckpointApprove = async (payload: { requestId: string }) => {
    try {
      const resolved = await workflowEngine.resolveCheckpoint({
        userId,
        requestId: payload.requestId,
        reviewerUserId: userId,
        decision: 'approve',
      });
      emitActivityEvent({
        userId,
        category: 'workflow',
        eventType: 'workflow.checkpoint_approved',
        title: 'Checkpoint approved',
        description: `Checkpoint ${resolved.checkpoint.id} approved and resumed.`,
      });
      setStatus(
        resolved.execution
          ? `Checkpoint approved. Resumed execution ${resolved.execution.id} with status ${resolved.execution.status}.`
          : 'Checkpoint approved.'
      );
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to approve checkpoint.');
    }
  };

  const handleCheckpointReject = async (payload: { requestId: string; reason: string }) => {
    try {
      const resolved = await workflowEngine.resolveCheckpoint({
        userId,
        requestId: payload.requestId,
        reviewerUserId: userId,
        decision: 'reject',
        rejectionReason: payload.reason,
      });
      emitActivityEvent({
        userId,
        category: 'workflow',
        eventType: 'workflow.checkpoint_rejected',
        title: 'Checkpoint rejected',
        description: `Checkpoint ${resolved.checkpoint.id} rejected.`,
      });
      setStatus(`Checkpoint rejected: ${resolved.checkpoint.rejectionReason ?? 'No reason provided.'}`);
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to reject checkpoint.');
    }
  };

  const handleCheckpointEdit = async (payload: {
    requestId: string;
    editedAction: {
      title?: string;
      description?: string;
      actionId?: string;
      inputTemplate?: string;
    };
  }) => {
    try {
      const resolved = await workflowEngine.resolveCheckpoint({
        userId,
        requestId: payload.requestId,
        reviewerUserId: userId,
        decision: 'edit',
        editedAction: payload.editedAction,
      });
      emitActivityEvent({
        userId,
        category: 'workflow',
        eventType: 'workflow.checkpoint_edited',
        title: 'Checkpoint edited',
        description: `Checkpoint ${resolved.checkpoint.id} edited and resumed.`,
      });
      setStatus(
        resolved.execution
          ? `Checkpoint edited and resumed. Execution ${resolved.execution.id} ended with ${resolved.execution.status}.`
          : 'Checkpoint edited.'
      );
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to edit checkpoint.');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        {activeToast ? (
          <div className="fixed right-6 top-24 z-40 max-w-sm rounded border border-[#3c5a6c] bg-[#102734] px-3 py-2 text-xs text-[#b8dcec] shadow-xl">
            <div className="font-medium text-[#d8ecf7]">Workflow notification</div>
            <div className="mt-1">{activeToast.message}</div>
            <div className="mt-2 text-[11px] text-[#9bc2d8]">
              {new Date(activeToast.createdAtIso).toLocaleString()} • {activeToast.status}
            </div>
          </div>
        ) : null}

        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Workflow Workbench</h2>
            <p className="text-sm text-[#8696a0]">
              Build workflows from natural language, run step chains, schedule triggers, and monitor history.
            </p>
          </div>
          <div className="text-xs text-[#8696a0]">{workflows.length} workflow(s)</div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Natural-Language Builder</h3>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe your workflow..."
              className="h-24 w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#dfe7eb]"
            />
            <button
              type="button"
              className="mt-2 rounded border border-[#00a884] px-3 py-1.5 text-xs text-[#aef5e9] hover:bg-[#12453f]"
              onClick={handleCreateWorkflow}
            >
              Generate Workflow
            </button>
            <p className="mt-2 text-xs text-[#8ea1ab]">
              Example: &quot;Summarize my emails every morning&quot; creates a 3-step plan.
            </p>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Workflow List</h3>
            <div className="space-y-2">
              {workflows.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                  No workflows yet.
                </div>
              ) : (
                workflows.map((workflow) => (
                  <button
                    key={workflow.id}
                    type="button"
                    className={`w-full rounded border px-3 py-2 text-left text-xs ${
                      selectedWorkflow?.id === workflow.id
                        ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                        : 'border-[#313d45] bg-[#111b21] text-[#9fb0ba] hover:border-[#4a5961]'
                    }`}
                    onClick={() => setSelectedWorkflowId(workflow.id)}
                  >
                    <div className="text-sm text-[#e9edef]">{workflow.name}</div>
                    <div className="mt-1 text-[11px] text-[#7f929c]">
                      Trigger: {workflow.trigger.type} • Steps: {workflow.steps.length}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Run Controls</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-[#00a884] px-3 py-1.5 text-xs text-[#aef5e9] hover:bg-[#12453f] disabled:opacity-60"
                onClick={() => {
                  void handleRunWorkflow();
                }}
                disabled={isRunning}
              >
                Run Workflow
              </button>
              <button
                type="button"
                className="rounded border border-[#3f6da0] px-3 py-1.5 text-xs text-[#bad8ff] hover:bg-[#1a314b] disabled:opacity-60"
                onClick={() => {
                  void handleRunBackground();
                }}
                disabled={isRunning}
              >
                Run in Background
              </button>
            </div>

            <div className="mt-3 rounded border border-[#2a3a44] bg-[#0f171c] p-2 text-xs text-[#9fb0ba]">
              Last heartbeat: {heartbeatAtIso ? new Date(heartbeatAtIso).toLocaleTimeString() : 'n/a'}
            </div>

            <div className="mt-3">
              <div className="mb-1 text-xs uppercase tracking-wide text-[#8ea1ab]">Event Trigger Simulation</div>
              <input
                value={eventText}
                onChange={(event) => setEventText(event.target.value)}
                placeholder="keyword event text"
                className="w-full rounded border border-[#313d45] bg-[#0f171c] px-2 py-2 text-xs text-[#dfe7eb]"
              />
              <button
                type="button"
                className="mt-2 rounded border border-[#546c7a] px-2 py-1 text-xs text-[#bdd1db] hover:bg-[#1c2b33]"
                onClick={() => {
                  void handleDispatchKeywordEvent();
                }}
              >
                Dispatch Keyword Event
              </button>
            </div>
          </section>
        </div>

        <section className={panelClass}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#e9edef]">Connector Registry</h3>
            <button
              type="button"
              className="rounded border border-[#4e6877] px-3 py-1 text-xs text-[#c5d8e1] hover:bg-[#1c2b33] disabled:opacity-60"
              onClick={() => {
                void runConnectorHealthChecks();
              }}
              disabled={isCheckingConnectorHealth}
            >
              {isCheckingConnectorHealth ? 'Checking...' : 'Run Health Check'}
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {availableConnectors.map((connector) => {
              const health = connectorHealthById.get(connector.manifest.id);
              return (
                <div key={connector.manifest.id} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                  <div className="text-sm text-[#e9edef]">{connector.manifest.name}</div>
                  <div className="mt-1 text-[11px] text-[#8ea1ab]">
                    id: {connector.manifest.id} • auth: {connector.manifest.auth.type} • actions:{' '}
                    {connector.manifest.actions.length}
                  </div>
                  <div className="mt-1 text-[11px] text-[#7f929c]">
                    {connector.manifest.actions.map((action) => action.id).join(', ')}
                  </div>

                  <div className="mt-2 flex gap-2">
                    <input
                      value={connectorTokens[connector.manifest.id] ?? ''}
                      onChange={(event) =>
                        setConnectorTokens((current) => ({
                          ...current,
                          [connector.manifest.id]: event.target.value,
                        }))
                      }
                      placeholder={`${connector.manifest.id}_token...`}
                      className="flex-1 rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb]"
                    />
                    <button
                      type="button"
                      className="rounded border border-[#546c7a] px-2 py-1 text-[11px] text-[#bdd1db] hover:bg-[#1c2b33]"
                      onClick={async () => {
                        try {
                          const status = await connectorRegistry.checkConnectorHealth({
                            userId,
                            connectorId: connector.manifest.id,
                            authToken: connectorTokens[connector.manifest.id],
                          });
                          upsertConnectorHealthStatus(status);
                          setStatus(`Health check complete for ${connector.manifest.id}: ${status.message}`);
                        } catch (error) {
                          setStatus(error instanceof Error ? error.message : 'Connector health check failed.');
                        }
                      }}
                    >
                      Check
                    </button>
                  </div>

                  <div
                    className={`mt-2 rounded border px-2 py-1 text-[11px] ${
                      health?.ok
                        ? 'border-[#2f5f49] bg-[#13271e] text-[#a8e5c4]'
                        : 'border-[#5f3f3f] bg-[#291718] text-[#efc3c3]'
                    }`}
                  >
                    {health
                      ? `${health.ok ? 'Healthy' : 'Needs setup'} • ${health.message}`
                      : 'No health check result yet.'}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <AgentDashboardPanel
          userId={userId}
          refreshToken={refreshTick}
          onMutate={() => {
            setRefreshTick((tick) => tick + 1);
          }}
        />

        {selectedWorkflow ? (
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Workflow Steps</h3>
            <div className="space-y-2">
              {selectedWorkflow.steps.map((step, index) => (
                <div
                  key={step.id}
                  className="flex items-center justify-between rounded border border-[#27343d] bg-[#0f171c] p-3"
                >
                  <div>
                    <div className="text-sm text-[#e9edef]">
                      {index + 1}. {step.title}
                    </div>
                    <div className="text-xs text-[#8ea1ab]">
                      {step.kind} • {step.actionId} • status={step.status}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded border border-[#4e6877] px-2 py-1 text-xs text-[#c5d8e1] hover:bg-[#1c2b33] disabled:opacity-60"
                    onClick={() => {
                      void handleRunStep(step.id);
                    }}
                    disabled={isRunning}
                  >
                    Run Step
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {selectedWorkflow ? (
          <PlanEditorPanel workflow={selectedWorkflow} onSave={handleSavePlanGraph} />
        ) : null}

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Output Panel</h3>
          {!latestExecution || !latestStepResult ? (
            <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              Run a workflow step to see output summaries and payload logs.
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
                <div className="text-[#e9edef]">Latest execution: {latestExecution.status}</div>
                <div className="mt-1 text-[#8ea1ab]">
                  {new Date(latestExecution.finishedAtIso).toLocaleString()} • {latestExecution.durationMs}ms
                </div>
              </div>
              <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
                <div className="text-[#e9edef]">Step summary</div>
                <div className="mt-1 whitespace-pre-wrap text-[#9fb0ba]">{latestStepResult.outputSummary}</div>
              </div>
              <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
                <div className="text-[#e9edef]">Payload log</div>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] text-[#8ea1ab]">
                  {JSON.stringify(latestStepResult.outputPayload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Execution History</h3>
            <div className="space-y-2">
              {executions.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                  No executions yet.
                </div>
              ) : (
                executions.slice(0, 8).map((execution) => (
                  <div key={execution.id} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#e9edef]">{execution.status}</span>
                      <span className="text-[#7f929c]">{execution.durationMs}ms</span>
                    </div>
                    <div className="mt-1 text-[#8ea1ab]">
                      {new Date(execution.finishedAtIso).toLocaleString()} • {execution.stepResults.length} step
                      result(s)
                    </div>
                    <div className="mt-1 text-[#9fb0ba]">
                      {(execution.stepResults[execution.stepResults.length - 1]?.outputSummary ??
                        'No output summary available.')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Inbox Artifacts</h3>
            <div className="space-y-2">
              {artifacts.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                  No artifacts yet.
                </div>
              ) : (
                artifacts.map((artifact) => (
                  <div key={artifact.id} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                    <div className="text-[#e9edef]">{artifact.title}</div>
                    <div className="mt-1 line-clamp-3 text-[#9fb0ba]">{artifact.body}</div>
                    <div className="mt-1 text-[#738892]">
                      {new Date(artifact.createdAtIso).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Workflow Notifications</h3>
            <div className="space-y-2">
              {notifications.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                  No notifications yet.
                </div>
              ) : (
                notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className={`w-full rounded border px-3 py-2 text-left text-xs ${
                      notification.read
                        ? 'border-[#27343d] bg-[#0f171c] text-[#8ea1ab]'
                        : 'border-[#3c5a6c] bg-[#102734] text-[#b8dcec]'
                    }`}
                    onClick={() => {
                      workflowEngine.markNotificationRead(userId, notification.id);
                      if (activeToastNotificationId === notification.id) {
                        setActiveToastNotificationId(null);
                      }
                      setRefreshTick((tick) => tick + 1);
                    }}
                  >
                    <div>{notification.message}</div>
                    <div className="mt-1 text-[11px] opacity-80">
                      {new Date(notification.createdAtIso).toLocaleString()} • {notification.status}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <ApprovalQueuePanel approvals={approvals} onApprove={handleApprove} onReject={handleReject} />
        </div>

        <CheckpointReviewPanel
          checkpoints={checkpoints}
          onApprove={handleCheckpointApprove}
          onReject={handleCheckpointReject}
          onEdit={handleCheckpointEdit}
        />

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Workflow Change History</h3>
          <div className="space-y-2">
            {workflowChangeEntries.length === 0 ? (
              <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                No workflow edits recorded yet.
              </div>
            ) : (
              workflowChangeEntries.map((entry) => (
                <div key={entry.id} className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#e9edef]">{entry.changeType}</span>
                    <span className="text-[#7f929c]">{new Date(entry.createdAtIso).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-[#9fb0ba]">{entry.summary}</div>
                </div>
              ))
            )}
          </div>

          {workflowChangeDiff ? (
            <div className="mt-3 rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#9fb0ba]">
              <div className="text-[#e9edef]">Diff view (oldest vs newest)</div>
              <div className="mt-1">
                Added steps: {workflowChangeDiff.addedStepIds.length || 0} • Removed steps:{' '}
                {workflowChangeDiff.removedStepIds.length || 0} • Changed steps:{' '}
                {workflowChangeDiff.changedStepIds.length || 0}
              </div>
              <div className="mt-1">
                Added branches: {workflowChangeDiff.addedBranchIds.length || 0} • Removed branches:{' '}
                {workflowChangeDiff.removedBranchIds.length || 0} • Changed branches:{' '}
                {workflowChangeDiff.changedBranchIds.length || 0}
              </div>
            </div>
          ) : null}
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

export default WorkflowWorkbenchPanel;
