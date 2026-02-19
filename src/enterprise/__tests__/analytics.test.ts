import { describe, expect, it } from 'vitest';
import {
  ActivityStore,
  createInMemoryActivityStoreAdapter,
  emitActivityEvent,
} from '../../activity';
import {
  createInMemoryKnowledgeStoreAdapter,
  ingestKnowledgeNote,
  KnowledgeGraphStore,
} from '../../knowledge';
import { OrgManager } from '../orgManager';
import { WorkspaceManager } from '../../team/workspaceManager';
import {
  createInMemoryWorkflowStoreAdapter,
  WorkflowEngine,
  WorkflowStore,
  type Workflow,
} from '../../workflows';
import { generateEnterpriseAnalytics } from '../analytics';

const workflow = (userId: string, id: string): Workflow => ({
  id,
  userId,
  name: `Workflow ${id}`,
  description: 'Enterprise analytics workflow',
  naturalLanguagePrompt: 'Run enterprise flow',
  trigger: {
    id: `trigger-${id}`,
    type: 'manual',
    enabled: true,
  },
  steps: [
    {
      id: `step-${id}`,
      title: 'Fetch inbox',
      description: 'Read from connector',
      kind: 'connector',
      actionId: 'connector.email.fetch_inbox',
      status: 'idle',
    },
  ],
  status: 'ready',
  createdAtIso: '2026-09-08T08:00:00.000Z',
  updatedAtIso: '2026-09-08T08:00:00.000Z',
});

describe('enterprise analytics', () => {
  it('aggregates analytics metrics for 3 workspaces', () => {
    const workspaces = new WorkspaceManager();
    const orgs = new OrgManager();

    const ws1 = workspaces.createWorkspace({
      ownerUserId: 'owner-analytics',
      name: 'Workspace One',
      nowIso: '2026-09-08T08:00:00.000Z',
    }).workspace;
    const ws2 = workspaces.createWorkspace({
      ownerUserId: 'owner-analytics',
      name: 'Workspace Two',
      nowIso: '2026-09-08T08:01:00.000Z',
    }).workspace;
    const ws3 = workspaces.createWorkspace({
      ownerUserId: 'owner-analytics',
      name: 'Workspace Three',
      nowIso: '2026-09-08T08:02:00.000Z',
    }).workspace;

    const org = orgs.createOrganization({
      ownerUserId: 'owner-analytics',
      name: 'Enterprise Analytics Org',
      workspaceIds: [ws1.id, ws2.id, ws3.id],
      nowIso: '2026-09-08T09:00:00.000Z',
    });

    const activityStore = new ActivityStore(createInMemoryActivityStoreAdapter());
    emitActivityEvent(
      {
        userId: 'owner-analytics',
        category: 'workflow',
        eventType: 'workflow.completed',
        title: 'Workflow completed',
        description: 'Completed enterprise digest workflow.',
        createdAtIso: '2026-09-08T10:00:00.000Z',
      },
      activityStore
    );
    emitActivityEvent(
      {
        userId: 'owner-analytics',
        category: 'chat',
        eventType: 'api.request',
        title: 'API call',
        description: 'Admin API usage event.',
        createdAtIso: '2026-09-08T10:05:00.000Z',
      },
      activityStore
    );

    const knowledgeStore = new KnowledgeGraphStore(createInMemoryKnowledgeStoreAdapter());
    ingestKnowledgeNote(
      {
        userId: 'owner-analytics',
        title: 'Enterprise note',
        text: 'Knowledge growth signal.',
        nowIso: '2026-09-08T10:10:00.000Z',
      },
      knowledgeStore
    );

    const workflowEngine = new WorkflowEngine({
      store: new WorkflowStore(createInMemoryWorkflowStoreAdapter()),
    });
    workflowEngine.saveWorkflow('owner-analytics', workflow('owner-analytics', 'wf-1'));

    const report = generateEnterpriseAnalytics(
      {
        organizationId: org.organization.id,
        actorUserId: 'owner-analytics',
        nowIso: '2026-09-08T12:00:00.000Z',
        rangeDays: 30,
      },
      {
        orgManager: orgs,
        workspaceManager: workspaces,
        activityStore,
        workflowEngine,
        knowledgeStore,
      }
    );

    expect(report.workspaces).toHaveLength(3);
    expect(report.totals.workflowRuns).toBeGreaterThan(0);
    expect(report.mostUsedConnectors.length).toBeGreaterThan(0);
  });
});
