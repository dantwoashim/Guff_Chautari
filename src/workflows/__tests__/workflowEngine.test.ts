import { describe, expect, it } from 'vitest';
import {
  WorkflowEngine,
  WorkflowMemoryScope,
  WorkflowStore,
  createInMemoryWorkflowStoreAdapter,
} from '../index';
import { ConnectorRegistry, createImapConnector, createNotionConnector } from '../../connectors';
import { listActivityEvents } from '../../activity';
import { ingestKnowledgeNote, searchKnowledgeSources } from '../../knowledge';

const buildEngine = () => {
  const store = new WorkflowStore(createInMemoryWorkflowStoreAdapter());
  const registry = new ConnectorRegistry();
  registry.register(createImapConnector());
  registry.register(createNotionConnector());
  const memoryScope = new WorkflowMemoryScope();
  return {
    store,
    engine: new WorkflowEngine({
      store,
      registry,
      memoryScope,
    }),
    memoryScope,
  };
};

describe('workflowEngine', () => {
  it('runs a full workflow with step chaining and writes artifacts', async () => {
    const { engine, memoryScope } = buildEngine();
    const workflow = engine.createFromPrompt({
      userId: 'user-chain',
      prompt: 'Summarize my emails every morning',
      nowIso: '2026-02-16T08:00:00.000Z',
    });

    const execution = await engine.runWorkflowById({
      userId: 'user-chain',
      workflowId: workflow.id,
      triggerType: 'manual',
    });

    expect(execution.status).toBe('completed');
    expect(execution.stepResults).toHaveLength(3);
    expect(execution.stepResults[1].outputPayload.summary).toBeDefined();
    expect(engine.listArtifacts('user-chain')).toHaveLength(1);

    const scope = memoryScope.list(memoryScope.namespaceFor(workflow.id));
    expect(scope.length).toBeGreaterThanOrEqual(3);
  });

  it('halts on approval-required connector mutation action', async () => {
    const { engine } = buildEngine();
    const workflow = engine.createFromPrompt({
      userId: 'user-approval',
      prompt: 'Review notion pages',
      nowIso: '2026-02-16T08:00:00.000Z',
    });

    const forced = {
      ...workflow,
      steps: [
        {
          ...workflow.steps[0],
          kind: 'connector' as const,
          actionId: 'connector.notion.update_page',
          status: 'idle' as const,
        },
      ],
    };
    engine.saveWorkflow('user-approval', forced);

    const execution = await engine.runWorkflowById({
      userId: 'user-approval',
      workflowId: workflow.id,
      triggerType: 'manual',
    });

    expect(execution.status).toBe('approval_required');
    expect(execution.stepResults[0].status).toBe('approval_required');
    expect(engine.listPendingApprovals().length).toBeGreaterThan(0);
  });

  it('advances schedule trigger after a scheduled execution', async () => {
    const { engine } = buildEngine();
    const workflow = engine.createFromPrompt({
      userId: 'user-scheduled',
      prompt: 'Summarize my emails every morning',
      nowIso: '2026-02-16T08:00:00.000Z',
    });

    const scheduled = {
      ...workflow,
      trigger: {
        ...workflow.trigger,
        type: 'schedule' as const,
        enabled: true,
        schedule: {
          intervalMinutes: 60,
          nextRunAtIso: '2026-02-16T09:00:00.000Z',
          cronLike: 'HOURLY',
        },
      },
    };
    engine.saveWorkflow('user-scheduled', scheduled);

    const execution = await engine.runWorkflowById({
      userId: 'user-scheduled',
      workflowId: workflow.id,
      triggerType: 'schedule',
    });

    const updated = engine.getWorkflow('user-scheduled', workflow.id);
    expect(updated?.trigger.type).toBe('schedule');
    expect(updated?.trigger.schedule?.nextRunAtIso).toBeDefined();
    expect(Date.parse(updated!.trigger.schedule!.nextRunAtIso)).toBeGreaterThan(
      Date.parse(execution.finishedAtIso)
    );
  });

  it('pauses on checkpoint and resumes after approval', async () => {
    const { engine } = buildEngine();
    const workflow = engine.createFromPrompt({
      userId: 'user-checkpoint',
      prompt: 'Summarize my emails every morning',
      nowIso: '2026-02-16T08:00:00.000Z',
    });

    const checkpointWorkflow = {
      ...workflow,
      steps: [
        workflow.steps[0],
        {
          id: 'step-checkpoint-review',
          title: 'Human checkpoint review',
          description: 'Confirm context before generating summary',
          kind: 'checkpoint' as const,
          actionId: 'checkpoint.review',
          status: 'idle' as const,
        },
        ...workflow.steps.slice(1),
      ],
    };
    engine.saveWorkflow('user-checkpoint', checkpointWorkflow);

    const paused = await engine.runWorkflowById({
      userId: 'user-checkpoint',
      workflowId: workflow.id,
      triggerType: 'manual',
    });

    expect(paused.status).toBe('checkpoint_required');

    const checkpoints = engine.listPendingCheckpoints('user-checkpoint');
    expect(checkpoints).toHaveLength(1);

    const resumed = await engine.resolveCheckpoint({
      userId: 'user-checkpoint',
      requestId: checkpoints[0].id,
      reviewerUserId: 'reviewer-user',
      decision: 'approve',
    });

    expect(resumed.execution?.status).toBe('completed');
    expect(engine.listExecutions('user-checkpoint', workflow.id).length).toBeGreaterThanOrEqual(2);
  });

  it('stops execution when workflow policy blocks connector usage', async () => {
    const { engine } = buildEngine();
    const workflow = engine.createFromPrompt({
      userId: 'user-policy-block',
      prompt: 'Summarize my emails every morning',
      nowIso: '2026-02-16T08:00:00.000Z',
    });

    engine.saveWorkflow('user-policy-block', {
      ...workflow,
      policy: {
        ...(workflow.policy ?? {}),
        id: workflow.policy?.id ?? 'wf-policy-policy-block',
        workflowId: workflow.id,
        allowedConnectorIds: ['notion'],
        blockedConnectorIds: [],
        createdAtIso: workflow.policy?.createdAtIso ?? '2026-02-16T08:00:00.000Z',
        updatedAtIso: '2026-02-16T08:00:00.000Z',
      },
    });

    const execution = await engine.runWorkflowById({
      userId: 'user-policy-block',
      workflowId: workflow.id,
      triggerType: 'manual',
    });

    expect(execution.status).toBe('failed');
    expect(execution.stepResults[0].outputSummary).toContain('Workflow policy violation');
  });

  it('integrates workflow runs with knowledge ingestion and activity timeline events', async () => {
    const { engine } = buildEngine();
    const userId = 'user-knowledge-activity-1';

    ingestKnowledgeNote({
      userId,
      title: 'Retention Notes',
      text: 'Churn increased after onboarding step 2. Investigate activation funnel.',
      nowIso: '2026-02-16T07:59:00.000Z',
    });

    const workflow = engine.createFromPrompt({
      userId,
      prompt: 'Summarize my notes on churn before sending email update',
      nowIso: '2026-02-16T08:00:00.000Z',
    });

    const execution = await engine.runWorkflowById({
      userId,
      workflowId: workflow.id,
      triggerType: 'manual',
    });

    expect(execution.status).toBe('completed');
    expect(execution.stepResults[0].stepId).toBeDefined();
    expect(
      Array.isArray(execution.stepResults[0].outputPayload.knowledgeHits)
    ).toBe(true);
    expect(execution.stepResults[0].outputSummary).toContain('knowledge');

    const sources = searchKnowledgeSources({
      userId,
      term: 'Workflow output',
      type: 'all',
    });
    expect(sources.some((source) => source.title.startsWith('Workflow output:'))).toBe(true);

    const workflowEvents = listActivityEvents({
      userId,
      filter: { categories: ['workflow'] },
      limit: 40,
    });
    expect(workflowEvents.some((event) => event.eventType === 'workflow.started')).toBe(true);
    expect(workflowEvents.some((event) => event.eventType === 'workflow.completed')).toBe(true);

    const knowledgeEvents = listActivityEvents({
      userId,
      filter: { categories: ['knowledge'] },
      limit: 40,
    });
    expect(
      knowledgeEvents.some((event) => event.eventType === 'knowledge.workflow_output_ingested')
    ).toBe(true);
  });

  it('supports pause, resume, and cancel workflow controls', async () => {
    const { engine } = buildEngine();
    const userId = 'user-controls';
    const workflow = engine.createFromPrompt({
      userId,
      prompt: 'Summarize my emails every morning',
      nowIso: '2026-02-16T08:00:00.000Z',
    });

    const paused = engine.pauseWorkflow({
      userId,
      workflowId: workflow.id,
    });
    expect(paused.status).toBe('paused');

    expect(() =>
      engine.runWorkflowById({
        userId,
        workflowId: workflow.id,
      })
    ).toThrow(/paused/i);

    const resumed = engine.resumeWorkflow({
      userId,
      workflowId: workflow.id,
    });
    expect(resumed.status).toBe('ready');

    const cancelled = engine.cancelWorkflow({
      userId,
      workflowId: workflow.id,
      reason: 'manual stop',
    });
    expect(cancelled.status).toBe('paused');
    expect(engine.listNotifications(userId).length).toBeGreaterThan(0);
  });
});
