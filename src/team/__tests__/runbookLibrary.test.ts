import { describe, expect, it } from 'vitest';
import { WorkflowEngine, WorkflowStore, createInMemoryWorkflowStoreAdapter } from '../../workflows';
import { TeamPlaybookManager } from '../playbooks';
import { instantiateBuiltInRunbook, listBuiltInRunbooks } from '../runbookLibrary';

const createManager = () => {
  const roleByUserId = new Map<string, 'owner' | 'member'>([['owner-1', 'owner']]);
  const workflowStore = new WorkflowStore(createInMemoryWorkflowStoreAdapter());
  const engine = new WorkflowEngine({ store: workflowStore });

  return new TeamPlaybookManager({
    workflowEngine: engine,
    resolveMemberRole: ({ userId }) => roleByUserId.get(userId) ?? null,
    resolveWorkspaceOwnerUserId: () => 'owner-1',
  });
};

describe('runbook library', () => {
  it('returns five built-in runbooks', () => {
    const runbooks = listBuiltInRunbooks();
    expect(runbooks).toHaveLength(5);
    expect(runbooks.map((runbook) => runbook.category).sort()).toEqual([
      'engineering',
      'hr',
      'operations',
      'research',
      'sales',
    ]);
  });

  it('instantiates each built-in runbook without errors', async () => {
    const manager = createManager();
    const runbooks = listBuiltInRunbooks();

    const results = await Promise.all(
      runbooks.map((runbook) =>
        instantiateBuiltInRunbook({
          workspaceId: 'workspace-1',
          actorUserId: 'owner-1',
          runbookId: runbook.id,
          manager,
          runNow: false,
        })
      )
    );

    expect(results).toHaveLength(5);
    for (const result of results) {
      expect(result.playbook.sourceRunbookId).toBeTruthy();
      expect(result.workflow.steps.length).toBeGreaterThan(0);
      expect(result.instance.executionHistory).toHaveLength(0);
    }
  });
});

