import { describe, expect, it } from 'vitest';
import { ActivityStore, createInMemoryActivityStoreAdapter, emitActivityEvent } from '../../activity';
import { ingestKnowledgeNote, KnowledgeGraphStore, createInMemoryKnowledgeStoreAdapter } from '../../knowledge';
import {
  WorkflowEngine,
  WorkflowStore,
  createInMemoryWorkflowStoreAdapter,
  type Workflow,
} from '../../workflows';
import { searchAcrossWorkspaces } from '../crossWorkspaceSearch';
import { WorkspaceManager } from '../workspaceManager';

const buildWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: overrides.id ?? 'workflow-1',
  userId: overrides.userId ?? 'actor-1',
  name: overrides.name ?? 'Launch workflow',
  description: overrides.description ?? 'Default workflow',
  naturalLanguagePrompt: overrides.naturalLanguagePrompt ?? 'Run launch checklist',
  trigger: overrides.trigger ?? {
    id: 'trigger-1',
    type: 'manual',
    enabled: true,
  },
  steps: overrides.steps ?? [],
  status: overrides.status ?? 'ready',
  createdAtIso: overrides.createdAtIso ?? '2026-03-06T08:00:00.000Z',
  updatedAtIso: overrides.updatedAtIso ?? '2026-03-06T08:00:00.000Z',
  policy: overrides.policy,
  planGraph: overrides.planGraph,
  lastExecutionId: overrides.lastExecutionId,
});

describe('cross workspace search', () => {
  it('searches personal and accessible workspace data with origin tags', () => {
    const manager = new WorkspaceManager();
    const workspaceA = manager.createWorkspace({
      ownerUserId: 'actor-1',
      name: 'Workspace Alpha',
      nowIso: '2026-03-06T08:00:00.000Z',
    });
    const invite = manager.inviteMember({
      workspaceId: workspaceA.workspace.id,
      email: 'member@example.com',
      role: 'member',
      invitedByUserId: 'actor-1',
      nowIso: '2026-03-06T08:05:00.000Z',
    });
    manager.respondToInvite({
      inviteId: invite.id,
      responderUserId: 'member-1',
      responderEmail: 'member@example.com',
      decision: 'accept',
      nowIso: '2026-03-06T08:10:00.000Z',
    });

    const workspaceHidden = manager.createWorkspace({
      ownerUserId: 'hidden-owner',
      name: 'Workspace Hidden',
      nowIso: '2026-03-06T08:00:00.000Z',
    });

    const activity = new ActivityStore(createInMemoryActivityStoreAdapter());
    emitActivityEvent(
      {
        userId: 'actor-1',
        category: 'chat',
        eventType: 'chat.message_user',
        title: 'Personal launch note',
        description: 'launch priority for this week',
        createdAtIso: '2026-03-06T09:00:00.000Z',
      },
      activity
    );
    emitActivityEvent(
      {
        userId: 'member-1',
        category: 'decision',
        eventType: 'decision.completed',
        title: 'Launch decision accepted',
        description: 'team launch plan approved',
        createdAtIso: '2026-03-06T09:30:00.000Z',
      },
      activity
    );
    emitActivityEvent(
      {
        userId: 'hidden-owner',
        category: 'chat',
        eventType: 'chat.message_user',
        title: 'Hidden launch message',
        description: 'this should not be visible',
        createdAtIso: '2026-03-06T09:40:00.000Z',
      },
      activity
    );

    const knowledge = new KnowledgeGraphStore(createInMemoryKnowledgeStoreAdapter());
    ingestKnowledgeNote(
      {
        userId: 'member-1',
        title: 'Launch retro',
        text: 'launch blockers and mitigation details',
        nowIso: '2026-03-06T10:00:00.000Z',
      },
      knowledge
    );
    ingestKnowledgeNote(
      {
        userId: 'hidden-owner',
        title: 'Hidden note',
        text: 'launch hidden workspace context',
        nowIso: '2026-03-06T10:00:00.000Z',
      },
      knowledge
    );

    const workflowStore = new WorkflowStore(createInMemoryWorkflowStoreAdapter());
    const engine = new WorkflowEngine({ store: workflowStore });
    engine.saveWorkflow(
      'member-1',
      buildWorkflow({
        id: 'workflow-member-launch',
        userId: 'member-1',
        name: 'Launch checklist automation',
        description: 'Automates launch status checks',
        naturalLanguagePrompt: 'run launch checklist and publish summary',
        updatedAtIso: '2026-03-06T11:00:00.000Z',
      })
    );
    engine.saveWorkflow(
      'hidden-owner',
      buildWorkflow({
        id: 'workflow-hidden-launch',
        userId: 'hidden-owner',
        name: 'Hidden launch workflow',
        description: 'Should not be visible',
        naturalLanguagePrompt: 'hidden launch operation',
        updatedAtIso: '2026-03-06T11:10:00.000Z',
      })
    );

    const response = searchAcrossWorkspaces(
      {
        actorUserId: 'actor-1',
        query: 'launch',
        includePersonal: true,
        limit: 40,
        nowIso: '2026-03-06T12:00:00.000Z',
      },
      {
        workspaceManager: manager,
        activityStore: activity,
        knowledgeStore: knowledge,
        workflowEngine: engine,
      }
    );

    expect(response.results.length).toBeGreaterThan(0);
    expect(response.searchedWorkspaceIds).toEqual([workspaceA.workspace.id]);
    expect(response.results.some((result) => result.scope === 'personal')).toBe(true);
    expect(
      response.results.some(
        (result) =>
          result.scope === 'workspace' && result.workspaceId === workspaceA.workspace.id
      )
    ).toBe(true);
    expect(response.results.some((result) => result.workspaceId === workspaceHidden.workspace.id)).toBe(
      false
    );
    expect(response.results.some((result) => result.ownerUserId === 'hidden-owner')).toBe(false);
  });

  it('supports workspace-only mode', () => {
    const manager = new WorkspaceManager();
    const workspace = manager.createWorkspace({
      ownerUserId: 'owner-1',
      name: 'Workspace Beta',
      nowIso: '2026-03-06T08:00:00.000Z',
    });
    const viewerInvite = manager.inviteMember({
      workspaceId: workspace.workspace.id,
      email: 'viewer@example.com',
      role: 'viewer',
      invitedByUserId: 'owner-1',
      nowIso: '2026-03-06T08:10:00.000Z',
    });
    manager.respondToInvite({
      inviteId: viewerInvite.id,
      responderUserId: 'viewer-1',
      responderEmail: 'viewer@example.com',
      decision: 'accept',
      nowIso: '2026-03-06T08:20:00.000Z',
    });

    const activity = new ActivityStore(createInMemoryActivityStoreAdapter());
    emitActivityEvent(
      {
        userId: 'owner-1',
        category: 'workflow',
        eventType: 'workflow.completed',
        title: 'Weekly benchmark publish',
        description: 'benchmark published for workspace beta',
        createdAtIso: '2026-03-06T09:00:00.000Z',
      },
      activity
    );

    const response = searchAcrossWorkspaces(
      {
        actorUserId: 'viewer-1',
        query: 'benchmark',
        includePersonal: false,
      },
      {
        workspaceManager: manager,
        activityStore: activity,
      }
    );

    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results.every((result) => result.scope === 'workspace')).toBe(true);
    expect(response.results.every((result) => result.workspaceId === workspace.workspace.id)).toBe(true);
  });
});
