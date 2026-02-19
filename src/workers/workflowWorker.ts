/// <reference lib="webworker" />

import { executeWorkflowStep } from '../workflows/stepExecutor';
import type { StepResult, WorkflowWorkerEvent, WorkflowWorkerRequest } from '../workflows/types';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<WorkflowWorkerRequest>) => {
  if (event.data.type !== 'run') return;

  const { workflow } = event.data;
  const startedAtIso = new Date().toISOString();
  const stepResults: StepResult[] = [];
  const heartbeatTimer = setInterval(() => {
    const payload: WorkflowWorkerEvent = {
      type: 'heartbeat',
      atIso: new Date().toISOString(),
    };
    ctx.postMessage(payload);
  }, 700);

  try {
    for (const step of workflow.steps) {
      const result = await executeWorkflowStep({
        userId: workflow.userId,
        workflow,
        step,
        previousResults: stepResults,
      });
      stepResults.push(result);
      if (result.status !== 'completed') break;
    }

    const completedPayload: WorkflowWorkerEvent = {
      type: 'completed',
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
      stepResults,
    };
    ctx.postMessage(completedPayload);
  } catch (error) {
    const failedPayload: WorkflowWorkerEvent = {
      type: 'failed',
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
      message: error instanceof Error ? error.message : 'Unknown worker failure',
      stepResults,
    };
    ctx.postMessage(failedPayload);
  } finally {
    clearInterval(heartbeatTimer);
  }
};
