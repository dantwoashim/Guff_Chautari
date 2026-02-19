import { describe, expect, it } from 'vitest';
import { ActivityStore, createInMemoryActivityStoreAdapter, emitActivityEvent } from '../../activity';
import { ingestKnowledgeNote, KnowledgeGraphStore, createInMemoryKnowledgeStoreAdapter } from '../../knowledge';
import {
  WorkflowEngine,
  WorkflowStore,
  createInMemoryWorkflowStoreAdapter,
  type Workflow,
} from '../../workflows';
import { generateTeamWeeklyBriefing } from '../briefingGenerator';
import { WorkspaceManager } from '../workspaceManager';

const buildWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: overrides.id ?? 'workflow-1',
  userId: overrides.userId ?? 'owner-1',
  name: overrides.name ?? 'Weekly Digest',
  description: overrides.description ?? 'Digest workflow',
  naturalLanguagePrompt: overrides.naturalLanguagePrompt ?? 'Summarize weekly updates',
  trigger: overrides.trigger ?? {
    id: 'trigger-1',
    type: 'schedule',
    enabled: true,
    schedule: {
      intervalMinutes: 7 * 24 * 60,
      nextRunAtIso: '2026-03-02T09:00:00.000Z',
      cronLike: 'WEEKLY@MON09:00',
    },
  },
  steps: overrides.steps ?? [],
  status: overrides.status ?? 'ready',
  createdAtIso: overrides.createdAtIso ?? '2026-02-16T09:00:00.000Z',
  updatedAtIso: overrides.updatedAtIso ?? '2026-02-16T09:00:00.000Z',
  policy: overrides.policy,
  planGraph: overrides.planGraph,
  lastExecutionId: overrides.lastExecutionId,
});

describe('team briefing generator', () => {
  it('summarizes two weeks of workspace activity', () => {
    const manager = new WorkspaceManager();
    const created = manager.createWorkspace({
      ownerUserId: 'owner-1',
      name: 'Team Alpha',
      nowIso: '2026-02-15T10:00:00.000Z',
    });
    const invite = manager.inviteMember({
      workspaceId: created.workspace.id,
      email: 'member@example.com',
      role: 'member',
      invitedByUserId: 'owner-1',
      nowIso: '2026-02-15T11:00:00.000Z',
    });
    manager.respondToInvite({
      inviteId: invite.id,
      responderUserId: 'member-1',
      responderEmail: 'member@example.com',
      decision: 'accept',
      nowIso: '2026-02-15T12:00:00.000Z',
    });

    const activity = new ActivityStore(createInMemoryActivityStoreAdapter());
    emitActivityEvent(
      {
        userId: 'owner-1',
        category: 'decision',
        eventType: 'decision.completed',
        title: 'Pricing model selected',
        description: 'Chose value-based pricing.',
        createdAtIso: '2026-02-18T10:00:00.000Z',
      },
      activity
    );
    emitActivityEvent(
      {
        userId: 'member-1',
        category: 'workflow',
        eventType: 'workflow.completed',
        title: 'Standup digest completed',
        description: 'Workflow completed for team standup.',
        createdAtIso: '2026-02-27T09:00:00.000Z',
      },
      activity
    );
    emitActivityEvent(
      {
        userId: 'member-1',
        category: 'chat',
        eventType: 'chat.message_user',
        title: 'Question asked',
        description: 'Shared blocker details.',
        createdAtIso: '2026-02-27T10:00:00.000Z',
      },
      activity
    );

    const workflows = new WorkflowStore(createInMemoryWorkflowStoreAdapter());
    const workflowEngine = new WorkflowEngine({ store: workflows });
    workflowEngine.saveWorkflow(
      'owner-1',
      buildWorkflow({
        id: 'workflow-scheduled',
        userId: 'owner-1',
      })
    );

    const knowledge = new KnowledgeGraphStore(createInMemoryKnowledgeStoreAdapter());
    ingestKnowledgeNote(
      {
        userId: 'member-1',
        title: 'Customer interview insights',
        text: 'Users asked for faster onboarding guidance.',
        nowIso: '2026-02-26T08:00:00.000Z',
      },
      knowledge
    );

    const briefing = generateTeamWeeklyBriefing(
      {
        workspaceId: created.workspace.id,
        actorUserId: 'owner-1',
        weeks: 2,
        nowIso: '2026-03-01T12:00:00.000Z',
      },
      {
        workspaceManager: manager,
        activityStore: activity,
        workflowEngine,
        knowledgeStore: knowledge,
      }
    );

    expect(briefing.weeks).toBe(2);
    expect(briefing.weekBuckets).toHaveLength(2);
    expect(briefing.weekBuckets[0].totalEvents).toBeGreaterThan(0);
    expect(briefing.weekBuckets[1].totalEvents).toBeGreaterThan(0);
    expect(briefing.keyDecisions.length).toBeGreaterThan(0);
    expect(briefing.recentKnowledgeAdditions.length).toBeGreaterThan(0);
    expect(briefing.workflowSummary.upcomingScheduledTasks).toBeGreaterThan(0);
    expect(briefing.memberActivity).toHaveLength(2);
    expect(briefing.heatmap.rows).toHaveLength(2);
  });
});

