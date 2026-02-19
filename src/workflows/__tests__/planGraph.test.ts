import { describe, expect, it } from 'vitest';
import {
  buildLinearPlanGraph,
  detectPlanGraphCycle,
  resolveNextStepId,
  topologicallySortWorkflowSteps,
  traversePlanGraph,
  type Workflow,
} from '../index';

const buildWorkflow = (): Workflow => {
  const steps = [
    {
      id: 'step-intake',
      title: 'Intake',
      description: 'Collect inputs',
      kind: 'transform' as const,
      actionId: 'transform.collect_context',
      status: 'idle' as const,
    },
    {
      id: 'step-finance-review',
      title: 'Finance Review',
      description: 'Route to finance',
      kind: 'transform' as const,
      actionId: 'transform.summarize',
      status: 'idle' as const,
    },
    {
      id: 'step-ops-review',
      title: 'Ops Review',
      description: 'Route to operations',
      kind: 'transform' as const,
      actionId: 'transform.summarize',
      status: 'idle' as const,
    },
    {
      id: 'step-publish',
      title: 'Publish',
      description: 'Publish output',
      kind: 'artifact' as const,
      actionId: 'artifact.publish',
      status: 'idle' as const,
    },
  ];

  return {
    id: 'workflow-graph-1',
    userId: 'graph-user',
    name: 'Graph Workflow',
    description: 'Workflow with branching plan graph',
    naturalLanguagePrompt: 'route by department',
    trigger: {
      id: 'trigger-1',
      type: 'manual',
      enabled: true,
    },
    steps,
    planGraph: {
      entryStepId: 'step-intake',
      branches: [
        {
          id: 'branch-finance',
          fromStepId: 'step-intake',
          toStepId: 'step-finance-review',
          label: 'Finance route',
          priority: 0,
          condition: {
            id: 'condition-finance',
            sourcePath: 'current.route',
            operator: 'string_equals',
            value: 'finance',
          },
        },
        {
          id: 'branch-ops',
          fromStepId: 'step-intake',
          toStepId: 'step-ops-review',
          label: 'Ops route',
          priority: 1,
          condition: {
            id: 'condition-ops',
            sourcePath: 'current.route',
            operator: 'string_equals',
            value: 'ops',
          },
        },
        {
          id: 'branch-finance-publish',
          fromStepId: 'step-finance-review',
          toStepId: 'step-publish',
          label: 'Publish finance output',
          priority: 0,
          condition: {
            id: 'condition-finance-publish',
            sourcePath: '__always',
            operator: 'exists',
          },
        },
        {
          id: 'branch-ops-publish',
          fromStepId: 'step-ops-review',
          toStepId: 'step-publish',
          label: 'Publish ops output',
          priority: 0,
          condition: {
            id: 'condition-ops-publish',
            sourcePath: '__always',
            operator: 'exists',
          },
        },
      ],
    },
    status: 'ready',
    createdAtIso: '2026-02-17T00:00:00.000Z',
    updatedAtIso: '2026-02-17T00:00:00.000Z',
  };
};

describe('planGraph', () => {
  it('traverses two branches based on condition matches', () => {
    const workflow = buildWorkflow();

    const financePath = traversePlanGraph({
      workflow,
      contextByStepId: {
        'step-intake': {
          route: 'finance',
        },
      },
    });

    const opsPath = traversePlanGraph({
      workflow,
      contextByStepId: {
        'step-intake': {
          route: 'ops',
        },
      },
    });

    expect(financePath).toEqual(['step-intake', 'step-finance-review', 'step-publish']);
    expect(opsPath).toEqual(['step-intake', 'step-ops-review', 'step-publish']);
  });

  it('detects cycles and topologically sorts acyclic graphs', () => {
    const workflow = buildWorkflow();

    const acyclic = detectPlanGraphCycle(workflow);
    expect(acyclic.hasCycle).toBe(false);

    const sorted = topologicallySortWorkflowSteps(workflow).map((step) => step.id);
    expect(sorted).toEqual([
      'step-intake',
      'step-finance-review',
      'step-ops-review',
      'step-publish',
    ]);

    const withCycle: Workflow = {
      ...workflow,
      planGraph: {
        ...workflow.planGraph!,
        branches: [
          ...workflow.planGraph!.branches,
          {
            id: 'branch-cycle',
            fromStepId: 'step-publish',
            toStepId: 'step-intake',
            label: 'Cycle',
            priority: 0,
            condition: {
              id: 'condition-cycle',
              sourcePath: '__always',
              operator: 'exists',
            },
          },
        ],
      },
    };

    const cycle = detectPlanGraphCycle(withCycle);
    expect(cycle.hasCycle).toBe(true);
    expect(cycle.cyclePath.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to linear next-step resolution when no graph is set', () => {
    const workflow = buildWorkflow();
    const linear: Workflow = {
      ...workflow,
      planGraph: undefined,
    };

    const firstNext = resolveNextStepId({
      workflow: linear,
      currentStepId: linear.steps[0].id,
    });

    expect(firstNext).toBe(linear.steps[1].id);
    expect(buildLinearPlanGraph(linear.steps).branches.length).toBe(linear.steps.length - 1);
  });
});
