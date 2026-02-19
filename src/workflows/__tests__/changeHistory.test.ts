import { describe, expect, it } from 'vitest';
import {
  WorkflowChangeHistory,
  createInMemoryWorkflowChangeStoreAdapter,
  diffWorkflowSnapshots,
  snapshotWorkflow,
  type Workflow,
} from '../index';

const buildWorkflow = (payload: {
  id: string;
  name: string;
  steps: Array<{ id: string; title: string; actionId: string; kind: 'transform' | 'artifact' | 'connector' | 'checkpoint' }>;
  branches?: Array<{ id: string; fromStepId: string; toStepId: string }>;
}): Workflow => {
  return {
    id: payload.id,
    userId: 'history-user',
    name: payload.name,
    description: `${payload.name} description`,
    naturalLanguagePrompt: 'history prompt',
    trigger: {
      id: 'trigger-history',
      type: 'manual',
      enabled: true,
    },
    steps: payload.steps.map((step) => ({
      ...step,
      description: `${step.title} description`,
      status: 'idle',
    })),
    planGraph: {
      entryStepId: payload.steps[0].id,
      branches: (payload.branches ?? []).map((branch, index) => ({
        id: branch.id,
        fromStepId: branch.fromStepId,
        toStepId: branch.toStepId,
        label: `${branch.fromStepId} -> ${branch.toStepId}`,
        priority: index,
        condition: {
          id: `cond-${branch.id}`,
          sourcePath: '__always',
          operator: 'exists',
        },
      })),
    },
    status: 'ready',
    createdAtIso: '2026-02-17T00:00:00.000Z',
    updatedAtIso: '2026-02-17T00:00:00.000Z',
  };
};

describe('workflow change history', () => {
  it('tracks plan edits and computes diff between v1 and v3', () => {
    const history = new WorkflowChangeHistory(createInMemoryWorkflowChangeStoreAdapter());

    const v1 = buildWorkflow({
      id: 'workflow-history',
      name: 'History Workflow',
      steps: [
        {
          id: 'step-1',
          title: 'Collect',
          actionId: 'transform.collect_context',
          kind: 'transform',
        },
        {
          id: 'step-2',
          title: 'Publish',
          actionId: 'artifact.publish',
          kind: 'artifact',
        },
      ],
      branches: [
        {
          id: 'branch-1',
          fromStepId: 'step-1',
          toStepId: 'step-2',
        },
      ],
    });

    const v2 = buildWorkflow({
      id: 'workflow-history',
      name: 'History Workflow',
      steps: [
        {
          id: 'step-1',
          title: 'Collect Inputs',
          actionId: 'transform.collect_context',
          kind: 'transform',
        },
        {
          id: 'step-2',
          title: 'Publish',
          actionId: 'artifact.publish',
          kind: 'artifact',
        },
      ],
      branches: [
        {
          id: 'branch-1',
          fromStepId: 'step-1',
          toStepId: 'step-2',
        },
      ],
    });

    const v3 = buildWorkflow({
      id: 'workflow-history',
      name: 'History Workflow',
      steps: [
        {
          id: 'step-1',
          title: 'Collect Inputs',
          actionId: 'transform.collect_context',
          kind: 'transform',
        },
        {
          id: 'step-3',
          title: 'Checkpoint',
          actionId: 'checkpoint.review',
          kind: 'checkpoint',
        },
        {
          id: 'step-2',
          title: 'Publish',
          actionId: 'artifact.publish',
          kind: 'artifact',
        },
      ],
      branches: [
        {
          id: 'branch-1',
          fromStepId: 'step-1',
          toStepId: 'step-3',
        },
        {
          id: 'branch-2',
          fromStepId: 'step-3',
          toStepId: 'step-2',
        },
      ],
    });

    history.recordWorkflowSave({
      userId: 'history-user',
      workflowId: v1.id,
      before: undefined,
      after: v1,
      summary: 'v1',
      createdAtIso: '2026-02-17T01:00:00.000Z',
    });

    history.recordWorkflowSave({
      userId: 'history-user',
      workflowId: v2.id,
      before: v1,
      after: v2,
      summary: 'v2',
      createdAtIso: '2026-02-17T02:00:00.000Z',
    });

    history.recordWorkflowSave({
      userId: 'history-user',
      workflowId: v3.id,
      before: v2,
      after: v3,
      summary: 'v3',
      createdAtIso: '2026-02-17T03:00:00.000Z',
    });

    const entries = history.list({
      userId: 'history-user',
      workflowId: v1.id,
      limit: 10,
    });
    expect(entries).toHaveLength(3);

    const diff = diffWorkflowSnapshots(snapshotWorkflow(v1), snapshotWorkflow(v3));
    expect(diff.addedStepIds).toContain('step-3');
    expect(diff.changedStepIds).toContain('step-1');
    expect(diff.addedBranchIds).toContain('branch-2');
  });
});
