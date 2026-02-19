import type { WorkflowExecution, WorkflowTriggerType, WorkflowWorkerEvent, WorkflowWorkerRequest } from './types';
import { WorkflowEngine, workflowEngine } from './workflowEngine';
import { workflowDeadLetterQueue } from './deadLetterQueue';

interface RunInBackgroundInput {
  userId: string;
  workflowId: string;
  triggerType?: WorkflowTriggerType;
  onHeartbeat?: (atIso: string) => void;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 4_000;

const clampTimeout = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(2_000, Math.floor(value));
};

const timeoutMessage = (timeoutMs: number): string =>
  `Background execution exceeded workflow timeout (${timeoutMs}ms).`;

export class WorkflowBackgroundRunner {
  constructor(private readonly engine: WorkflowEngine = workflowEngine) {}

  async runInBackground(input: RunInBackgroundInput): Promise<WorkflowExecution> {
    const workflow = this.engine.getWorkflow(input.userId, input.workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${input.workflowId} not found.`);
    }

    const triggerType = input.triggerType ?? 'manual';
    const onHeartbeat = input.onHeartbeat ?? (() => undefined);
    const workflowTimeoutMs = clampTimeout(
      workflow.policy?.budget?.maxRuntimeMs,
      DEFAULT_TIMEOUT_MS
    );
    const heartbeatTimeoutMs = clampTimeout(
      Math.min(workflowTimeoutMs, DEFAULT_HEARTBEAT_TIMEOUT_MS),
      DEFAULT_HEARTBEAT_TIMEOUT_MS
    );

    if (typeof Worker === 'undefined') {
      const startedAtIso = new Date().toISOString();
      const startedAtMs = Date.parse(startedAtIso);
      const heartbeat = setInterval(() => {
        const atIso = new Date().toISOString();
        onHeartbeat(atIso);
      }, 800);
      try {
        const execution = await new Promise<WorkflowExecution>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(timeoutMessage(workflowTimeoutMs)));
          }, workflowTimeoutMs);

          void this.engine
            .runWorkflow({
              userId: input.userId,
              workflow,
              triggerType,
            })
            .then((result) => {
              clearTimeout(timeout);
              resolve(result);
            })
            .catch((error) => {
              clearTimeout(timeout);
              reject(error);
            });
        });
        return execution;
      } catch (error) {
        const finishedAtIso = new Date().toISOString();
        const message = error instanceof Error ? error.message : 'Background execution failed.';
        const execution = this.engine.commitBackgroundExecution({
          userId: input.userId,
          workflowId: workflow.id,
          triggerType,
          startedAtIso,
          finishedAtIso,
          stepResults: [],
          failedMessage: message,
        });

        workflowDeadLetterQueue.append({
          userId: input.userId,
          workflowId: workflow.id,
          triggerType,
          reason: message,
          startedAtIso,
          finishedAtIso,
          stepResults: execution.stepResults,
        });

        throw new Error(
          `Background run failed after ${Math.max(
            0,
            Date.parse(finishedAtIso) - startedAtMs
          )}ms: ${message}`
        );
      } finally {
        clearInterval(heartbeat);
      }
    }

    return new Promise<WorkflowExecution>((resolve, reject) => {
      const startedAtIso = new Date().toISOString();
      const startedAtMs = Date.parse(startedAtIso);
      let settled = false;
      let lastHeartbeatMs = startedAtMs;

      const worker = new Worker(new URL('../workers/workflowWorker.ts', import.meta.url), {
        type: 'module',
      });

      const cleanup = () => {
        clearInterval(monitorTimer);
        worker.terminate();
      };

      const fail = (message: string, payload?: { finishedAtIso?: string; stepResults?: WorkflowExecution['stepResults'] }) => {
        if (settled) return;
        settled = true;
        cleanup();
        const finishedAtIso = payload?.finishedAtIso ?? new Date().toISOString();
        const execution = this.engine.commitBackgroundExecution({
          userId: input.userId,
          workflowId: input.workflowId,
          triggerType,
          startedAtIso,
          finishedAtIso,
          stepResults: payload?.stepResults ?? [],
          failedMessage: message,
        });

        workflowDeadLetterQueue.append({
          userId: input.userId,
          workflowId: input.workflowId,
          triggerType,
          reason: message,
          startedAtIso,
          finishedAtIso,
          stepResults: execution.stepResults,
        });

        reject(
          new Error(
            `Background run failed: ${message} (execution=${execution.id}, durationMs=${Math.max(
              0,
              Date.parse(finishedAtIso) - startedAtMs
            )})`
          )
        );
      };

      const monitorTimer = setInterval(() => {
        if (settled) return;
        const nowMs = Date.now();

        if (nowMs - startedAtMs > workflowTimeoutMs) {
          fail(timeoutMessage(workflowTimeoutMs));
          return;
        }

        if (nowMs - lastHeartbeatMs > heartbeatTimeoutMs) {
          fail(`Background worker heartbeat stalled for ${heartbeatTimeoutMs}ms.`);
        }
      }, 300);

      worker.onmessage = (event: MessageEvent<WorkflowWorkerEvent>) => {
        if (settled) return;
        const payload = event.data;
        if (payload.type === 'heartbeat') {
          lastHeartbeatMs = Date.now();
          onHeartbeat(payload.atIso);
          return;
        }

        if (payload.type === 'completed') {
          settled = true;
          cleanup();
          const execution = this.engine.commitBackgroundExecution({
            userId: input.userId,
            workflowId: input.workflowId,
            triggerType,
            startedAtIso: payload.startedAtIso,
            finishedAtIso: payload.finishedAtIso,
            stepResults: payload.stepResults,
          });
          resolve(execution);
          return;
        }

        fail(payload.message, {
          finishedAtIso: payload.finishedAtIso,
          stepResults: payload.stepResults,
        });
      };

      worker.onerror = (event) => {
        fail(event.message || 'Workflow background worker crashed.');
      };

      const request: WorkflowWorkerRequest = {
        type: 'run',
        workflow,
      };
      worker.postMessage(request);
    });
  }
}

export const workflowBackgroundRunner = new WorkflowBackgroundRunner();
