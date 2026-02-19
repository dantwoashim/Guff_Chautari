import { describe, expect, it } from 'vitest';
import { WorkflowEngine, WorkflowStore, createInMemoryWorkflowStoreAdapter } from '../../workflows';
import { TeamPlaybookManager } from '../playbooks';

const createManager = () => {
  const roleByUserId = new Map<string, 'owner' | 'member' | 'viewer'>([
    ['owner-1', 'owner'],
    ['member-1', 'member'],
    ['viewer-1', 'viewer'],
  ]);
  const workflowStore = new WorkflowStore(createInMemoryWorkflowStoreAdapter());
  const engine = new WorkflowEngine({ store: workflowStore });

  return new TeamPlaybookManager({
    workflowEngine: engine,
    resolveMemberRole: ({ userId }) => roleByUserId.get(userId) ?? null,
    resolveWorkspaceOwnerUserId: () => 'owner-1',
  });
};

describe('team playbooks', () => {
  it('creates playbook, instantiates with parameters, and runs workflow', async () => {
    const manager = createManager();
    const workspaceId = 'workspace-1';

    const playbook = manager.createPlaybook({
      workspaceId,
      createdByUserId: 'owner-1',
      name: 'Sprint Summary {{sprint_name}}',
      description: 'Summarize sprint {{sprint_name}} updates.',
      category: 'engineering',
      naturalLanguagePromptTemplate: 'Generate updates for {{sprint_name}}.',
      parameters: [
        {
          key: 'sprint_name',
          label: 'Sprint Name',
          required: true,
          defaultValue: 'Sprint 1',
        },
      ],
      stepTemplates: [
        {
          title: 'Synthesize notes',
          description: 'Summarize existing context',
          kind: 'transform',
          actionId: 'transform.summarize',
        },
        {
          title: 'Publish summary',
          description: 'Publish summary artifact',
          kind: 'artifact',
          actionId: 'artifact.publish',
        },
      ],
    });

    const result = await manager.instantiatePlaybook({
      workspaceId,
      playbookId: playbook.id,
      actorUserId: 'member-1',
      parameterValues: { sprint_name: 'Sprint 9' },
      runNow: true,
    });

    expect(result.workflow.name).toContain('Sprint 9');
    expect(result.workflow.naturalLanguagePrompt).toContain('Sprint 9');
    expect(result.execution?.status).toBe('completed');
    expect(result.instance.executionHistory).toHaveLength(1);
    expect(result.instance.lastExecutionStatus).toBe('completed');
  });

  it('denies viewer from creating playbooks', () => {
    const manager = createManager();
    expect(() =>
      manager.createPlaybook({
        workspaceId: 'workspace-1',
        createdByUserId: 'viewer-1',
        name: 'Blocked',
        description: 'blocked',
        category: 'operations',
        naturalLanguagePromptTemplate: 'blocked',
        stepTemplates: [
          {
            title: 'noop',
            description: 'noop',
            kind: 'transform',
            actionId: 'transform.summarize',
          },
        ],
      })
    ).toThrow('Role viewer cannot perform workspace.workflows.write.');
  });
});

