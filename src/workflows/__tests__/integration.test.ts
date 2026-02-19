import { describe, expect, it } from 'vitest';
import { ConnectorRegistry, createImapConnector, createNotionConnector } from '../../connectors';
import {
  WorkflowEngine,
  WorkflowMemoryScope,
  WorkflowStore,
  WorkflowTriggerManager,
  createInMemoryWorkflowStoreAdapter,
} from '../index';

describe('workflow integration', () => {
  it('runs scheduled email workflow and produces inbox artifact + notification', async () => {
    const store = new WorkflowStore(createInMemoryWorkflowStoreAdapter());
    const registry = new ConnectorRegistry();
    registry.register(createImapConnector());
    registry.register(createNotionConnector());
    const memoryScope = new WorkflowMemoryScope();
    const engine = new WorkflowEngine({ store, registry, memoryScope });
    const triggerManager = new WorkflowTriggerManager();
    const userId = 'user-scheduled';

    const workflow = engine.createFromPrompt({
      userId,
      prompt: 'Summarize my emails every morning',
      nowIso: '2026-02-16T08:00:00.000Z',
    });

    const forcedSchedule = {
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
    engine.saveWorkflow(userId, forcedSchedule);

    triggerManager.register(forcedSchedule, async () => {
      await engine.runWorkflowById({
        userId,
        workflowId: forcedSchedule.id,
        triggerType: 'schedule',
      });
    });

    await triggerManager.tick('2026-02-16T09:00:30.000Z');

    const executions = engine.listExecutions(userId, workflow.id);
    const artifacts = engine.listArtifacts(userId);
    const notifications = engine.listNotifications(userId);

    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe('completed');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].body.length).toBeGreaterThan(10);
    expect(notifications).toHaveLength(1);
  });
});
