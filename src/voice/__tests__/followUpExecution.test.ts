import { describe, expect, it, vi } from 'vitest';
import { WorkflowEngine, WorkflowStore, createInMemoryWorkflowStoreAdapter } from '../../workflows';
import type { ConnectorInvocationOutcome } from '../../connectors';
import { executeMeetingFollowUps } from '../followUpExecution';
import type { MeetingActionExtraction, MeetingSession } from '../types';

const sessionFixture: MeetingSession = {
  id: 'meeting-session-1',
  userId: 'owner-1',
  workspaceId: 'workspace-1',
  title: 'Weekly Product Sync',
  status: 'ended',
  createdAtIso: '2026-03-07T10:00:00.000Z',
  updatedAtIso: '2026-03-07T10:30:00.000Z',
  endedAtIso: '2026-03-07T10:30:00.000Z',
  segments: [
    {
      id: 'segment-1',
      sessionId: 'meeting-session-1',
      speaker: 'host',
      text: 'We decided to prioritize onboarding automation.',
      source: 'manual',
      startedAtIso: '2026-03-07T10:00:00.000Z',
      endedAtIso: '2026-03-07T10:02:00.000Z',
    },
  ],
  notes: [],
};

const extractionFixture: MeetingActionExtraction = {
  decisions: [
    {
      id: 'decision-1',
      text: 'Prioritize onboarding automation in this sprint.',
      confidence: 0.9,
    },
  ],
  actionItems: [
    {
      id: 'action-email',
      text: 'Send follow-up email with decisions and owners.',
      confidence: 0.88,
      assignee: 'alex@example.com',
    },
    {
      id: 'action-schedule',
      text: 'Schedule next meeting for roadmap review.',
      confidence: 0.86,
    },
  ],
  questions: [],
  topics: [
    {
      id: 'topic-1',
      label: 'onboarding',
      score: 0.94,
    },
  ],
  method: 'heuristic',
  generatedAtIso: '2026-03-07T10:31:00.000Z',
};

describe('meeting follow-up execution', () => {
  it('creates email-draft workflow tasks and invokes calendar connector for schedule items', async () => {
    const workflowStore = new WorkflowStore(createInMemoryWorkflowStoreAdapter());
    const engine = new WorkflowEngine({ store: workflowStore });

    const invoke = vi.fn(async (): Promise<ConnectorInvocationOutcome> => ({
      connectorId: 'calendar',
      actionId: 'create_event',
      policyDecision: {
        id: 'policy-1',
        actor_user_id: 'owner-1',
        action_id: 'connector.permission.grant',
        resource_type: 'connector:calendar',
        decision: 'escalate',
        risk_tier: 'red',
        reason: 'approval_required:rule:connector.permission.grant',
        expires_at: '2026-03-08T00:00:00.000Z',
        created_at: '2026-03-07T10:32:00.000Z',
        metadata: {
          approval_request_id: 'approval-1',
        },
      },
      approvalRequest: {
        id: 'approval-1',
        action_id: 'connector.permission.grant',
        actor_user_id: 'owner-1',
        risk_tier: 'red',
        reason: 'rule:connector.permission.grant',
        status: 'pending',
        requested_at: '2026-03-07T10:32:00.000Z',
        expires_at: '2026-03-08T00:00:00.000Z',
        payload: {
          actor: { user_id: 'owner-1', role: 'owner' },
          action: {
            action_id: 'connector.permission.grant',
            resource_type: 'connector:calendar',
            mutation: true,
            idempotent: false,
          },
        },
      },
      result: undefined,
    }));

    const execution = await executeMeetingFollowUps(
      {
        actorUserId: 'owner-1',
        actorRole: 'owner',
        session: sessionFixture,
        extraction: extractionFixture,
        defaultCalendarDurationMinutes: 45,
      },
      {
        workflowEngine: engine,
        connectorRegistry: {
          invoke,
        },
        nowIso: () => '2026-03-07T10:32:00.000Z',
      }
    );

    expect(execution.createdWorkflows.length).toBeGreaterThan(0);
    expect(execution.generatedEmailDrafts.length).toBeGreaterThan(0);
    expect(execution.scheduledEvents.some((event) => event.actionItemId === 'action-schedule')).toBe(
      true
    );
    expect(execution.connectorInvocations.length).toBe(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: 'calendar',
        actionId: 'create_event',
      })
    );

    const workflows = engine.listWorkflows('owner-1');
    expect(workflows.length).toBeGreaterThan(0);
    expect(workflows[0].name.toLowerCase()).toContain('meeting email draft');
  });
});
