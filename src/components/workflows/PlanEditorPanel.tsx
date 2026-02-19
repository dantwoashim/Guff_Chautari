import React, { useEffect, useMemo, useState } from 'react';
import {
  detectPlanGraphCycle,
  ensureWorkflowPlanGraph,
  topologicallySortWorkflowSteps,
  type BranchConditionOperator,
  type NumberComparator,
  type Workflow,
} from '../../workflows';

interface PlanEditorPanelProps {
  workflow: Workflow;
  onSave: (workflow: Workflow) => void;
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const parseConditionValue = (payload: {
  operator: BranchConditionOperator;
  rawValue: string;
}): string | number | boolean | undefined => {
  if (payload.operator === 'exists' || payload.operator === 'not_exists') {
    return undefined;
  }

  if (payload.operator === 'number_compare') {
    const parsed = Number(payload.rawValue);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return parsed;
  }

  if (payload.rawValue.trim().toLowerCase() === 'true') return true;
  if (payload.rawValue.trim().toLowerCase() === 'false') return false;
  return payload.rawValue;
};

export const PlanEditorPanel: React.FC<PlanEditorPanelProps> = ({ workflow, onSave }) => {
  const [draftWorkflow, setDraftWorkflow] = useState<Workflow>(workflow);
  const [editorStatus, setEditorStatus] = useState('');

  const [fromStepId, setFromStepId] = useState(workflow.steps[0]?.id ?? '');
  const [toStepId, setToStepId] = useState(workflow.steps[1]?.id ?? workflow.steps[0]?.id ?? '');
  const [branchLabel, setBranchLabel] = useState('When condition matches');
  const [sourcePath, setSourcePath] = useState('current.output.urgency');
  const [operator, setOperator] = useState<BranchConditionOperator>('string_contains');
  const [conditionValue, setConditionValue] = useState('high');
  const [numberComparator, setNumberComparator] = useState<NumberComparator>('gte');

  useEffect(() => {
    setDraftWorkflow(workflow);
    setFromStepId(workflow.steps[0]?.id ?? '');
    setToStepId(workflow.steps[1]?.id ?? workflow.steps[0]?.id ?? '');
    setEditorStatus('');
  }, [workflow]);

  const draftGraph = useMemo(() => ensureWorkflowPlanGraph(draftWorkflow), [draftWorkflow]);

  const cycleInfo = useMemo(() => detectPlanGraphCycle(draftWorkflow), [draftWorkflow]);

  const topologicalOrder = useMemo(() => {
    try {
      return topologicallySortWorkflowSteps(draftWorkflow).map((step) => step.id);
    } catch {
      return draftWorkflow.steps.map((step) => step.id);
    }
  }, [draftWorkflow]);

  const outgoingByStep = useMemo(() => {
    const grouped = new Map<string, typeof draftGraph.branches>();
    for (const branch of draftGraph.branches) {
      const list = grouped.get(branch.fromStepId) ?? [];
      list.push(branch);
      grouped.set(branch.fromStepId, list);
    }

    for (const list of grouped.values()) {
      list.sort((left, right) => left.priority - right.priority);
    }

    return grouped;
  }, [draftGraph]);

  const updateDraftWorkflow = (updater: (current: Workflow) => Workflow) => {
    setDraftWorkflow((current) => {
      const next = updater(current);
      return {
        ...next,
        updatedAtIso: new Date().toISOString(),
      };
    });
  };

  const moveStep = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= draftWorkflow.steps.length) return;

    updateDraftWorkflow((current) => {
      const steps = [...current.steps];
      const [step] = steps.splice(index, 1);
      steps.splice(target, 0, step);
      return {
        ...current,
        steps,
      };
    });
  };

  const addBranch = (): void => {
    if (!fromStepId || !toStepId) {
      setEditorStatus('Select both source and destination steps.');
      return;
    }

    if (fromStepId === toStepId) {
      setEditorStatus('Branch source and destination cannot be the same step.');
      return;
    }

    const parsedValue = parseConditionValue({
      operator,
      rawValue: conditionValue,
    });

    if (operator === 'number_compare' && typeof parsedValue !== 'number') {
      setEditorStatus('Numeric comparisons require a valid number value.');
      return;
    }

    const sourcePathValue = sourcePath.trim();
    if ((operator !== 'exists' && operator !== 'not_exists') && sourcePathValue.length === 0) {
      setEditorStatus('Condition source path is required.');
      return;
    }

    updateDraftWorkflow((current) => {
      const graph = ensureWorkflowPlanGraph(current);
      const siblings = graph.branches.filter((branch) => branch.fromStepId === fromStepId);

      return {
        ...current,
        planGraph: {
          ...graph,
          branches: [
            ...graph.branches,
            {
              id: makeId('branch'),
              fromStepId,
              toStepId,
              label: branchLabel.trim() || `${fromStepId} -> ${toStepId}`,
              priority: siblings.length,
              condition: {
                id: makeId('condition'),
                sourcePath: sourcePathValue || '__always',
                operator,
                value: parsedValue,
                numberComparator: operator === 'number_compare' ? numberComparator : undefined,
                caseSensitive: false,
              },
            },
          ],
        },
      };
    });

    setEditorStatus('Branch added to draft graph.');
  };

  const removeBranch = (branchId: string): void => {
    updateDraftWorkflow((current) => {
      const graph = ensureWorkflowPlanGraph(current);
      return {
        ...current,
        planGraph: {
          ...graph,
          branches: graph.branches.filter((branch) => branch.id !== branchId),
        },
      };
    });
    setEditorStatus('Branch removed from draft graph.');
  };

  return (
    <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#e9edef]">Plan Editor (DAG)</h3>
          <p className="mt-1 text-xs text-[#8ea1ab]">
            Edit step ordering and conditional branches for workflow graph execution.
          </p>
        </div>
        <button
          type="button"
          className="rounded border border-[#4e6877] px-3 py-1 text-xs text-[#c5d8e1] hover:bg-[#1c2b33]"
          onClick={() => {
            const graph = ensureWorkflowPlanGraph(draftWorkflow);
            onSave({
              ...draftWorkflow,
              planGraph: graph,
            });
            setEditorStatus('Workflow graph saved.');
          }}
        >
          Save Graph
        </button>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
          <div className="mb-2 text-xs font-semibold text-[#e9edef]">Step Nodes</div>
          <div className="space-y-2">
            {draftWorkflow.steps.map((step, index) => (
              <div key={step.id} className="rounded border border-[#32414a] bg-[#111d24] p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[#d9e6ec]">
                      {index + 1}. {step.title}
                    </div>
                    <div className="text-[11px] text-[#7f929c]">
                      {step.id} • {step.kind}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded border border-[#45545e] px-2 py-0.5 text-[11px] text-[#b8c6cc]"
                      onClick={() => moveStep(index, -1)}
                      disabled={index === 0}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="rounded border border-[#45545e] px-2 py-0.5 text-[11px] text-[#b8c6cc]"
                      onClick={() => moveStep(index, 1)}
                      disabled={index === draftWorkflow.steps.length - 1}
                    >
                      Down
                    </button>
                  </div>
                </div>
                <div className="mt-1 space-y-1">
                  {(outgoingByStep.get(step.id) ?? []).map((branch) => (
                    <div
                      key={branch.id}
                      className="flex items-center justify-between rounded border border-[#28363f] bg-[#0f171c] px-2 py-1 text-[11px]"
                    >
                      <span className="text-[#9fb0ba]">
                        {branch.label}: {branch.toStepId} ({branch.condition.operator})
                      </span>
                      <button
                        type="button"
                        className="rounded border border-[#654242] px-1.5 py-0.5 text-[10px] text-[#efc3c3]"
                        onClick={() => removeBranch(branch.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded border border-[#27343d] bg-[#0f171c] p-3">
          <div>
            <div className="mb-1 text-xs font-semibold text-[#e9edef]">Add Conditional Branch</div>
            <div className="grid gap-2 md:grid-cols-2">
              <select
                value={fromStepId}
                onChange={(event) => setFromStepId(event.target.value)}
                className="rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb]"
              >
                {draftWorkflow.steps.map((step) => (
                  <option key={`from-${step.id}`} value={step.id}>
                    from: {step.title}
                  </option>
                ))}
              </select>
              <select
                value={toStepId}
                onChange={(event) => setToStepId(event.target.value)}
                className="rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb]"
              >
                {draftWorkflow.steps.map((step) => (
                  <option key={`to-${step.id}`} value={step.id}>
                    to: {step.title}
                  </option>
                ))}
              </select>
              <input
                value={branchLabel}
                onChange={(event) => setBranchLabel(event.target.value)}
                placeholder="Branch label"
                className="rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb]"
              />
              <select
                value={operator}
                onChange={(event) => setOperator(event.target.value as BranchConditionOperator)}
                className="rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb]"
              >
                <option value="string_equals">string equals</option>
                <option value="string_contains">string contains</option>
                <option value="number_compare">number compare</option>
                <option value="regex_match">regex match</option>
                <option value="exists">exists</option>
                <option value="not_exists">not exists</option>
              </select>
              <input
                value={sourcePath}
                onChange={(event) => setSourcePath(event.target.value)}
                placeholder="Source path (e.g. current.output.priority)"
                className="rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb]"
              />
              <input
                value={conditionValue}
                onChange={(event) => setConditionValue(event.target.value)}
                placeholder="Condition value"
                disabled={operator === 'exists' || operator === 'not_exists'}
                className="rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb] disabled:opacity-60"
              />
            </div>

            {operator === 'number_compare' ? (
              <select
                value={numberComparator}
                onChange={(event) => setNumberComparator(event.target.value as NumberComparator)}
                className="mt-2 rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb]"
              >
                <option value="gt">&gt;</option>
                <option value="gte">&gt;=</option>
                <option value="lt">&lt;</option>
                <option value="lte">&lt;=</option>
                <option value="eq">=</option>
              </select>
            ) : null}

            <button
              type="button"
              className="mt-2 rounded border border-[#00a884] px-3 py-1 text-xs text-[#aef5e9] hover:bg-[#12453f]"
              onClick={addBranch}
            >
              Add Branch
            </button>
          </div>

          <div className="rounded border border-[#27343d] bg-[#111b21] p-2 text-[11px] text-[#9fb0ba]">
            <div>
              Entry step: <span className="text-[#dfe7eb]">{draftGraph.entryStepId || 'n/a'}</span>
            </div>
            <div>
              Cycle status:{' '}
              <span className={cycleInfo.hasCycle ? 'text-[#efc3c3]' : 'text-[#a8e5c4]'}>
                {cycleInfo.hasCycle ? `cycle detected (${cycleInfo.cyclePath.join(' -> ')})` : 'acyclic'}
              </span>
            </div>
            <div className="mt-1 break-all">Topological order: {topologicalOrder.join(' -> ') || 'n/a'}</div>
          </div>
        </div>
      </div>

      {editorStatus ? (
        <div className="mt-3 rounded border border-[#31596b] bg-[#102531] px-3 py-2 text-xs text-[#b8dbeb]">
          {editorStatus}
        </div>
      ) : null}
    </section>
  );
};

export default PlanEditorPanel;
