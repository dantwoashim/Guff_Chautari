import { describe, expect, it } from 'vitest';
import type { StepResult, Workflow } from '../types';
import { WorkflowBackgroundRunner } from '../backgroundRunner';
import { workflowDeadLetterQueue } from '../deadLetterQueue';
import type { WorkflowEngine } from '../workflowEngine';

const buildWorkflow = (userId: string): Workflow => ({
  id: 'workflow-timeout-1',
  userId,
  name: 'Timeout Workflow',
  description: 'Used for timeout tests',
  naturalLanguagePrompt: 'run in background',
  trigger: {
    id: 'trigger-1',
    type: 'manual',
    enabled: true,
  },
  steps: [
    {
      id: 'step-1',
      title: 'Collect context',
      description: 'Collect context',
      kind: 'transform',
      actionId: 'transform.collect_context',
      status: 'idle',
    },
  ],
  status: 'ready',
  createdAtIso: '2026-02-17T00:00:00.000Z',
  updatedAtIso: '2026-02-17T00:00:00.000Z',
  policy: {
    id: 'wf-policy-timeout-1',
    workflowId: 'workflow-timeout-1',
    budget: {
      maxRuntimeMs: 20,
    },
    createdAtIso: '2026-02-17T00:00:00.000Z',
    updatedAtIso: '2026-02-17T00:00:00.000Z',
  },
});

describe('workflowBackgroundRunner', () => {
  it('adds failed background executions to dead-letter queue on timeout', async () => {
    const userId = 'user-background-timeout';
    workflowDeadLetterQueue.clear(userId);

    const workflow = buildWorkflow(userId);
    let committedCount = 0;

    const fakeEngine = {
      getWorkflow() {
        return workflow;
      },
      async runWorkflow() {
        await new Promise<void>(() => undefined);
        throw new Error('unreachable');
      },
      commitBackgroundExecution(payload: {
        userId: string;
        workflowId: string;
        triggerType: 'manual';
        startedAtIso: string;
        finishedAtIso: string;
        stepResults: StepResult[];
        failedMessage?: string;
      }) {
        committedCount += 1;
        return {
          id: `execution-timeout-${committedCount}`,
          workflowId: payload.workflowId,
          userId: payload.userId,
          status: 'failed' as const,
          triggerType: payload.triggerType,
          startedAtIso: payload.startedAtIso,
          finishedAtIso: payload.finishedAtIso,
          durationMs: Math.max(0, Date.parse(payload.finishedAtIso) - Date.parse(payload.startedAtIso)),
          stepResults:
            payload.stepResults.length > 0
              ? payload.stepResults
              : [
                  {
                    id: 'step-result-timeout',
                    workflowId: payload.workflowId,
                    stepId: 'worker-timeout',
                    status: 'failed',
                    startedAtIso: payload.startedAtIso,
                    finishedAtIso: payload.finishedAtIso,
                    durationMs: 0,
                    outputSummary: payload.failedMessage ?? 'timeout',
                    outputPayload: {},
                    errorMessage: payload.failedMessage ?? 'timeout',
                  },
                ],
          memoryNamespace: `workflow:${payload.workflowId}`,
        };
      },
    } as unknown as WorkflowEngine;

    const originalWorker = (globalThis as { Worker?: unknown }).Worker;
    (globalThis as { Worker?: unknown }).Worker = undefined;

    const runner = new WorkflowBackgroundRunner(fakeEngine);

    try {
      await expect(
        runner.runInBackground({
          userId,
          workflowId: workflow.id,
        })
      ).rejects.toThrow(/timeout|exceeded/i);
    } finally {
      (globalThis as { Worker?: unknown }).Worker = originalWorker;
    }

    expect(committedCount).toBe(1);
    const entries = workflowDeadLetterQueue.list(userId);
    expect(entries).toHaveLength(1);
    expect(entries[0].workflowId).toBe(workflow.id);
    expect(entries[0].reason.toLowerCase()).toContain('timeout');
  });
});
