import { evaluateBranchCondition } from './conditionEvaluator';
import type { ConditionalBranch, PlanGraph, Workflow, WorkflowStep } from './types';

const stepIndexMapForWorkflow = (workflow: Workflow): Map<string, number> => {
  return new Map(workflow.steps.map((step, index) => [step.id, index]));
};

const buildAdjacency = (workflow: Workflow): Map<string, string[]> => {
  const stepIds = new Set(workflow.steps.map((step) => step.id));
  const adjacency = new Map<string, string[]>();

  for (const step of workflow.steps) {
    adjacency.set(step.id, []);
  }

  const branches = workflow.planGraph?.branches ?? [];
  for (const branch of branches) {
    if (!stepIds.has(branch.fromStepId) || !stepIds.has(branch.toStepId)) continue;
    adjacency.get(branch.fromStepId)?.push(branch.toStepId);
  }

  return adjacency;
};

const sortBranches = (
  branches: ReadonlyArray<ConditionalBranch>,
  stepIndexMap: ReadonlyMap<string, number>
): ConditionalBranch[] => {
  return [...branches].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    const leftTo = stepIndexMap.get(left.toStepId) ?? Number.MAX_SAFE_INTEGER;
    const rightTo = stepIndexMap.get(right.toStepId) ?? Number.MAX_SAFE_INTEGER;
    if (leftTo !== rightTo) {
      return leftTo - rightTo;
    }

    return left.id.localeCompare(right.id);
  });
};

export const buildLinearPlanGraph = (steps: ReadonlyArray<WorkflowStep>): PlanGraph => {
  const entryStepId = steps[0]?.id ?? '';
  return {
    entryStepId,
    branches: steps.slice(0, -1).map((step, index) => {
      const next = steps[index + 1];
      return {
        id: `branch-${step.id}-to-${next.id}`,
        fromStepId: step.id,
        toStepId: next.id,
        label: 'Next step',
        priority: index,
        condition: {
          id: `condition-${step.id}-always`,
          sourcePath: '__always',
          operator: 'exists',
        },
      } satisfies ConditionalBranch;
    }),
  };
};

export const ensureWorkflowPlanGraph = (workflow: Workflow): PlanGraph => {
  const base = workflow.planGraph ?? {
    entryStepId: workflow.steps[0]?.id ?? '',
    branches: [],
  };
  const stepIds = new Set(workflow.steps.map((step) => step.id));

  const entryStepId = stepIds.has(base.entryStepId) ? base.entryStepId : workflow.steps[0]?.id ?? '';
  const branches = base.branches.filter(
    (branch) => stepIds.has(branch.fromStepId) && stepIds.has(branch.toStepId)
  );

  return {
    entryStepId,
    branches,
  };
};

export const listOutgoingBranches = (payload: {
  workflow: Workflow;
  stepId: string;
}): ConditionalBranch[] => {
  const stepIndexMap = stepIndexMapForWorkflow(payload.workflow);
  const graph = ensureWorkflowPlanGraph(payload.workflow);
  return sortBranches(
    graph.branches.filter((branch) => branch.fromStepId === payload.stepId),
    stepIndexMap
  );
};

export const detectPlanGraphCycle = (workflow: Workflow): {
  hasCycle: boolean;
  cyclePath: string[];
} => {
  const adjacency = buildAdjacency({
    ...workflow,
    planGraph: ensureWorkflowPlanGraph(workflow),
  });

  const state = new Map<string, 'visiting' | 'visited'>();
  const stack: string[] = [];

  const visit = (node: string): string[] | null => {
    state.set(node, 'visiting');
    stack.push(node);

    const neighbors = adjacency.get(node) ?? [];
    for (const neighbor of neighbors) {
      const neighborState = state.get(neighbor);
      if (neighborState === 'visiting') {
        const cycleStart = stack.lastIndexOf(neighbor);
        const cycle = cycleStart >= 0 ? [...stack.slice(cycleStart), neighbor] : [neighbor, neighbor];
        return cycle;
      }

      if (neighborState !== 'visited') {
        const cycle = visit(neighbor);
        if (cycle) return cycle;
      }
    }

    stack.pop();
    state.set(node, 'visited');
    return null;
  };

  for (const step of workflow.steps) {
    if (state.has(step.id)) continue;
    const cycle = visit(step.id);
    if (cycle) {
      return {
        hasCycle: true,
        cyclePath: cycle,
      };
    }
  }

  return {
    hasCycle: false,
    cyclePath: [],
  };
};

export const topologicallySortWorkflowSteps = (workflow: Workflow): WorkflowStep[] => {
  if (workflow.steps.length <= 1) return [...workflow.steps];

  const cycle = detectPlanGraphCycle(workflow);
  if (cycle.hasCycle) {
    throw new Error(`Plan graph contains a cycle: ${cycle.cyclePath.join(' -> ')}`);
  }

  const graph = ensureWorkflowPlanGraph(workflow);
  const stepById = new Map(workflow.steps.map((step) => [step.id, step]));
  const stepIndex = stepIndexMapForWorkflow(workflow);

  const adjacency = buildAdjacency({
    ...workflow,
    planGraph: graph,
  });
  const indegree = new Map(workflow.steps.map((step) => [step.id, 0]));

  for (const branches of adjacency.values()) {
    for (const toStepId of branches) {
      indegree.set(toStepId, (indegree.get(toStepId) ?? 0) + 1);
    }
  }

  const queue = workflow.steps
    .map((step) => step.id)
    .filter((stepId) => (indegree.get(stepId) ?? 0) === 0)
    .sort((left, right) => (stepIndex.get(left) ?? 0) - (stepIndex.get(right) ?? 0));

  const orderedIds: string[] = [];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) continue;
    orderedIds.push(next);

    const neighbors = adjacency.get(next) ?? [];
    for (const neighbor of neighbors) {
      const remaining = (indegree.get(neighbor) ?? 0) - 1;
      indegree.set(neighbor, remaining);
      if (remaining === 0) {
        queue.push(neighbor);
        queue.sort((left, right) => (stepIndex.get(left) ?? 0) - (stepIndex.get(right) ?? 0));
      }
    }
  }

  if (orderedIds.length !== workflow.steps.length) {
    throw new Error('Plan graph ordering failed: disconnected or invalid DAG state.');
  }

  return orderedIds.map((stepId) => stepById.get(stepId)).filter((step): step is WorkflowStep => Boolean(step));
};

export const resolveNextStepId = (payload: {
  workflow: Workflow;
  currentStepId: string;
  contextByStepId?: Record<string, Record<string, unknown>>;
  rootContext?: Record<string, unknown>;
}): string | null => {
  const graph = payload.workflow.planGraph;

  if (!graph) {
    const currentIndex = payload.workflow.steps.findIndex((step) => step.id === payload.currentStepId);
    if (currentIndex === -1) return null;
    return payload.workflow.steps[currentIndex + 1]?.id ?? null;
  }

  const outgoing = listOutgoingBranches({
    workflow: payload.workflow,
    stepId: payload.currentStepId,
  });

  if (outgoing.length === 0) return null;

  const source = {
    root: payload.rootContext ?? {},
    steps: payload.contextByStepId ?? {},
    currentStepId: payload.currentStepId,
    current: payload.contextByStepId?.[payload.currentStepId] ?? {},
  };

  for (const branch of outgoing) {
    const matches = evaluateBranchCondition({
      condition: branch.condition,
      source,
    });
    if (matches) {
      return branch.toStepId;
    }
  }

  return null;
};

export const traversePlanGraph = (payload: {
  workflow: Workflow;
  startStepId?: string;
  contextByStepId?: Record<string, Record<string, unknown>>;
  rootContext?: Record<string, unknown>;
  maxDepth?: number;
}): string[] => {
  if (payload.workflow.steps.length === 0) return [];

  const graph = ensureWorkflowPlanGraph(payload.workflow);
  const stepIds = new Set(payload.workflow.steps.map((step) => step.id));
  const startStepId = payload.startStepId ?? graph.entryStepId;
  const initialStepId = stepIds.has(startStepId) ? startStepId : payload.workflow.steps[0].id;

  const maxDepth = Math.max(payload.maxDepth ?? payload.workflow.steps.length * 4, 1);
  const visitedIds = new Set<string>();
  const path: string[] = [];

  let cursor: string | null = initialStepId;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (!cursor || !stepIds.has(cursor)) break;

    path.push(cursor);
    if (visitedIds.has(cursor)) {
      break;
    }
    visitedIds.add(cursor);

    cursor = resolveNextStepId({
      workflow: payload.workflow,
      currentStepId: cursor,
      contextByStepId: payload.contextByStepId,
      rootContext: payload.rootContext,
    });
  }

  return path;
};
