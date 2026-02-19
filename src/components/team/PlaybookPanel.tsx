import React, { useEffect, useMemo, useState } from 'react';
import { workspaceManager } from '../../team/workspaceManager';
import { teamPlaybookManager, type TeamPlaybookTemplate } from '../../team/playbooks';
import {
  installBuiltInRunbook,
  instantiateBuiltInRunbook,
  listBuiltInRunbooks,
  type BuiltInRunbookDefinition,
} from '../../team/runbookLibrary';

interface PlaybookPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const categoryColor: Record<string, string> = {
  operations: 'border-[#4b6f86] bg-[#132633] text-[#c1dceb]',
  engineering: 'border-[#4f6f5e] bg-[#15291f] text-[#c9ead7]',
  sales: 'border-[#6f5a4b] bg-[#2e2016] text-[#efd6c6]',
  hr: 'border-[#715a74] bg-[#2a1e2e] text-[#e6d3ea]',
  research: 'border-[#5f6680] bg-[#1c2236] text-[#ced7f3]',
};

const formatTimestamp = (iso: string): string => {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) return iso;
  return new Date(value).toLocaleString();
};

const parameterDefaults = (playbook: TeamPlaybookTemplate | null): Record<string, string> => {
  if (!playbook) return {};
  return teamPlaybookManager.getParameterDefaults(playbook);
};

export const PlaybookPanel: React.FC<PlaybookPanelProps> = ({ userId }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [workspaceNameInput, setWorkspaceNameInput] = useState('Core Team');
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [runbookCategoryFilter, setRunbookCategoryFilter] = useState<
    'all' | 'operations' | 'engineering' | 'sales' | 'hr' | 'research'
  >('all');

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

  const runbooks = useMemo(() => {
    return listBuiltInRunbooks({
      category: runbookCategoryFilter === 'all' ? undefined : runbookCategoryFilter,
    });
  }, [runbookCategoryFilter]);

  const playbooks = useMemo(() => {
    if (!activeWorkspace) return [];
    void refreshTick;
    return teamPlaybookManager.listPlaybooks({
      workspaceId: activeWorkspace.id,
      actorUserId: userId,
    });
  }, [activeWorkspace, refreshTick, userId]);

  useEffect(() => {
    if (!selectedPlaybookId && playbooks.length > 0) {
      setSelectedPlaybookId(playbooks[0].id);
      return;
    }
    if (selectedPlaybookId && !playbooks.some((playbook) => playbook.id === selectedPlaybookId)) {
      setSelectedPlaybookId(playbooks[0]?.id ?? null);
    }
  }, [playbooks, selectedPlaybookId]);

  const selectedPlaybook = useMemo(() => {
    if (!selectedPlaybookId) return null;
    return playbooks.find((playbook) => playbook.id === selectedPlaybookId) ?? null;
  }, [playbooks, selectedPlaybookId]);

  useEffect(() => {
    setParameterValues((current) => ({
      ...parameterDefaults(selectedPlaybook),
      ...current,
    }));
  }, [selectedPlaybook]);

  const instances = useMemo(() => {
    if (!activeWorkspace) return [];
    void refreshTick;
    return teamPlaybookManager.listPlaybookInstances({
      workspaceId: activeWorkspace.id,
      actorUserId: userId,
    });
  }, [activeWorkspace, refreshTick, userId]);

  const instancesByPlaybookId = useMemo(() => {
    const map = new Map<string, number>();
    for (const instance of instances) {
      map.set(instance.playbookId, (map.get(instance.playbookId) ?? 0) + 1);
    }
    return map;
  }, [instances]);

  const selectedPlaybookInstances = useMemo(() => {
    if (!selectedPlaybook) return [];
    return instances.filter((instance) => instance.playbookId === selectedPlaybook.id);
  }, [instances, selectedPlaybook]);

  const withWorkspace = <T,>(operation: (workspaceId: string) => Promise<T>): Promise<T> => {
    if (!activeWorkspace) {
      return Promise.reject(new Error('Create or select a workspace first.'));
    }
    return operation(activeWorkspace.id);
  };

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

  const handleInstallRunbook = async (runbook: BuiltInRunbookDefinition) => {
    setIsBusy(true);
    try {
      await withWorkspace(async (workspaceId) => {
        const playbook = installBuiltInRunbook({
          workspaceId,
          actorUserId: userId,
          runbookId: runbook.id,
        });
        setStatus(`Installed runbook "${runbook.name}" as playbook "${playbook.name}".`);
      });
      refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Runbook install failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleQuickInstantiate = async (runbook: BuiltInRunbookDefinition) => {
    setIsBusy(true);
    try {
      await withWorkspace(async (workspaceId) => {
        const result = await instantiateBuiltInRunbook({
          workspaceId,
          actorUserId: userId,
          runbookId: runbook.id,
          runNow: false,
        });
        setStatus(
          `Instantiated "${runbook.name}" into workflow "${result.workflow.name}" (instance ${result.instance.id}).`
        );
      });
      refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Quick instantiate failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleInstantiateSelected = async (runNow: boolean) => {
    if (!selectedPlaybook) {
      setStatus('Select a workspace playbook first.');
      return;
    }

    setIsBusy(true);
    try {
      await withWorkspace(async (workspaceId) => {
        const result = await teamPlaybookManager.instantiatePlaybook({
          workspaceId,
          playbookId: selectedPlaybook.id,
          actorUserId: userId,
          parameterValues,
          runNow,
        });
        if (result.execution) {
          setStatus(
            `Run completed with status "${result.execution.status}" (${result.execution.durationMs}ms).`
          );
        } else {
          setStatus(`Instantiated workflow "${result.workflow.name}" without execution.`);
        }
      });
      refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Playbook instantiation failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleReRunInstance = async (instanceId: string) => {
    setIsBusy(true);
    try {
      await withWorkspace(async (workspaceId) => {
        const result = await teamPlaybookManager.runPlaybookInstance({
          workspaceId,
          instanceId,
          actorUserId: userId,
        });
        setStatus(
          `Re-ran instance ${instanceId}: ${result.execution.status} (${result.execution.durationMs}ms).`
        );
      });
      refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Instance rerun failed.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Team Playbooks</h2>
            <p className="text-sm text-[#8696a0]">
              Install built-in runbooks, parameterize reusable workflows, and track execution history.
            </p>
          </div>
          <div className="text-xs text-[#8696a0]">
            {activeWorkspace ? `Workspace: ${activeWorkspace.name}` : 'No workspace selected'}
          </div>
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
                {workspaces.length === 0 ? (
                  <option value="">No workspace yet</option>
                ) : null}
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

        <div className="grid gap-4 lg:grid-cols-3">
          <section className={panelClass}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#e9edef]">Runbook Library</h3>
              <select
                value={runbookCategoryFilter}
                onChange={(event) =>
                  setRunbookCategoryFilter(
                    event.target.value as 'all' | 'operations' | 'engineering' | 'sales' | 'hr' | 'research'
                  )
                }
                className="rounded border border-[#313d45] bg-[#0f171c] px-2 py-1 text-[11px] text-[#dfe7eb]"
              >
                <option value="all">all</option>
                <option value="operations">operations</option>
                <option value="engineering">engineering</option>
                <option value="sales">sales</option>
                <option value="hr">hr</option>
                <option value="research">research</option>
              </select>
            </div>
            <div className="space-y-2">
              {runbooks.map((runbook) => (
                <article
                  key={runbook.id}
                  className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-[#e9edef]">{runbook.name}</div>
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] ${
                        categoryColor[runbook.category] ?? 'border-[#313d45] bg-[#131c22] text-[#a4b1b8]'
                      }`}
                    >
                      {runbook.category}
                    </span>
                  </div>
                  <div className="mt-1 text-[#8ea1ab]">{runbook.description}</div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={isBusy || !activeWorkspace}
                      className="rounded border border-[#5a8d5f] px-2 py-1 text-[11px] text-[#bceac1] hover:bg-[#173125] disabled:opacity-60"
                      onClick={() => {
                        void handleInstallRunbook(runbook);
                      }}
                    >
                      Install
                    </button>
                    <button
                      type="button"
                      disabled={isBusy || !activeWorkspace}
                      className="rounded border border-[#4f6f84] px-2 py-1 text-[11px] text-[#bfd8e8] hover:bg-[#1d3140] disabled:opacity-60"
                      onClick={() => {
                        void handleQuickInstantiate(runbook);
                      }}
                    >
                      Quick Instantiate
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Workspace Playbooks</h3>
            <div className="space-y-2">
              {playbooks.map((playbook) => (
                <button
                  key={playbook.id}
                  type="button"
                  className={`w-full rounded border px-3 py-2 text-left text-xs ${
                    selectedPlaybook?.id === playbook.id
                      ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                      : 'border-[#313d45] bg-[#0f171c] text-[#9fb0ba] hover:border-[#4a5961]'
                  }`}
                  onClick={() => setSelectedPlaybookId(playbook.id)}
                >
                  <div className="text-sm text-[#e9edef]">{playbook.name}</div>
                  <div className="mt-1 text-[11px] text-[#7f929c]">
                    {playbook.category} • {playbook.stepTemplates.length} step template(s)
                  </div>
                  <div className="mt-1 text-[11px] text-[#7f929c]">
                    Instances: {instancesByPlaybookId.get(playbook.id) ?? 0}
                  </div>
                </button>
              ))}
              {playbooks.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0d151a] p-2 text-xs text-[#8ea1ab]">
                  No playbooks in this workspace yet. Install from runbook library.
                </div>
              ) : null}
            </div>

            {selectedPlaybook ? (
              <div className="mt-3 rounded border border-[#27343d] bg-[#0f171c] p-3">
                <div className="mb-2 text-xs uppercase tracking-wide text-[#8ea1ab]">Parameters</div>
                <div className="space-y-2">
                  {selectedPlaybook.parameters.map((definition) => (
                    <label key={definition.key} className="block">
                      <div className="mb-1 text-[11px] text-[#9fb0ba]">
                        {definition.label}
                        {definition.required ? ' *' : ''}
                      </div>
                      {definition.inputType === 'select' && definition.options ? (
                        <select
                          value={parameterValues[definition.key] ?? ''}
                          onChange={(event) =>
                            setParameterValues((current) => ({
                              ...current,
                              [definition.key]: event.target.value,
                            }))
                          }
                          className="w-full rounded border border-[#313d45] bg-[#0b151b] px-2 py-1.5 text-xs text-[#dfe7eb]"
                        >
                          {definition.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={parameterValues[definition.key] ?? ''}
                          onChange={(event) =>
                            setParameterValues((current) => ({
                              ...current,
                              [definition.key]: event.target.value,
                            }))
                          }
                          className="w-full rounded border border-[#313d45] bg-[#0b151b] px-2 py-1.5 text-xs text-[#dfe7eb]"
                        />
                      )}
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    className="rounded border border-[#4f6f84] px-2.5 py-1.5 text-xs text-[#bfd8e8] hover:bg-[#1d3140] disabled:opacity-60"
                    onClick={() => {
                      void handleInstantiateSelected(false);
                    }}
                  >
                    Instantiate
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    className="rounded border border-[#5a8d5f] px-2.5 py-1.5 text-xs text-[#bceac1] hover:bg-[#173125] disabled:opacity-60"
                    onClick={() => {
                      void handleInstantiateSelected(true);
                    }}
                  >
                    Instantiate + Run
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Execution History</h3>
            {selectedPlaybookInstances.length === 0 ? (
              <div className="rounded border border-[#2d3942] bg-[#0d151a] p-2 text-xs text-[#8ea1ab]">
                No instances yet for selected playbook.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedPlaybookInstances.map((instance) => (
                  <article
                    key={instance.id}
                    className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs"
                  >
                    <div className="text-[#e9edef]">Instance {instance.id.slice(0, 12)}</div>
                    <div className="mt-1 text-[11px] text-[#8ea1ab]">
                      Workflow {instance.workflowId.slice(0, 12)} • last status:{' '}
                      {instance.lastExecutionStatus ?? 'not run'}
                    </div>
                    <div className="mt-1 text-[11px] text-[#7f929c]">
                      Created {formatTimestamp(instance.createdAtIso)}
                    </div>
                    <div className="mt-1 text-[11px] text-[#7f929c]">
                      Runs: {instance.executionHistory.length}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        className="rounded border border-[#5a8d5f] px-2 py-1 text-[11px] text-[#bceac1] hover:bg-[#173125] disabled:opacity-60"
                        onClick={() => {
                          void handleReRunInstance(instance.id);
                        }}
                      >
                        Run Again
                      </button>
                    </div>
                    {instance.executionHistory.length > 0 ? (
                      <div className="mt-2 rounded border border-[#1f2c34] bg-[#0d151a] p-2 text-[11px] text-[#9fb0ba]">
                        Latest: {instance.executionHistory[0].status} at{' '}
                        {formatTimestamp(instance.executionHistory[0].finishedAtIso)}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        {status ? (
          <div className="rounded border border-[#2d3942] bg-[#0d151a] px-3 py-2 text-xs text-[#aebec8]">
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PlaybookPanel;
