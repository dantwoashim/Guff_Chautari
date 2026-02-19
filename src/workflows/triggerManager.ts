import type { Workflow, WorkflowEventType, WorkflowTrigger } from './types';

export interface TriggerDispatchEvent {
  type: WorkflowEventType;
  text?: string;
}

type TriggerCallback = (workflow: Workflow, trigger: WorkflowTrigger) => Promise<void> | void;

interface RegisteredTrigger {
  workflow: Workflow;
  callback: TriggerCallback;
}

export class WorkflowTriggerManager {
  private readonly registrations = new Map<string, RegisteredTrigger>();
  private readonly inFlight = new Set<string>();

  register(workflow: Workflow, callback: TriggerCallback): () => void {
    this.registrations.set(workflow.id, { workflow, callback });
    return () => {
      this.registrations.delete(workflow.id);
      this.inFlight.delete(workflow.id);
    };
  }

  clear(): void {
    this.registrations.clear();
    this.inFlight.clear();
  }

  async tick(nowIso: string = new Date().toISOString()): Promise<void> {
    const nowMs = Date.parse(nowIso);
    const pending: Promise<void>[] = [];

    for (const [workflowId, registration] of this.registrations.entries()) {
      const trigger = registration.workflow.trigger;
      if (!trigger.enabled || trigger.type !== 'schedule' || !trigger.schedule) continue;

      const dueMs = Date.parse(trigger.schedule.nextRunAtIso);
      if (Number.isNaN(dueMs) || dueMs > nowMs) continue;
      if (this.inFlight.has(workflowId)) continue;

      this.inFlight.add(workflowId);
      const runPromise = Promise.resolve(registration.callback(registration.workflow, trigger))
        .catch(() => {
          // Trigger callback errors are handled by caller execution logs.
        })
        .finally(() => {
          this.inFlight.delete(workflowId);
        });

      pending.push(runPromise);

      const intervalMinutes = Math.max(1, trigger.schedule.intervalMinutes);
      const nextRunMs = nowMs + intervalMinutes * 60 * 1000;
      registration.workflow = {
        ...registration.workflow,
        trigger: {
          ...trigger,
          schedule: {
            ...trigger.schedule,
            nextRunAtIso: new Date(nextRunMs).toISOString(),
          },
        },
      };
      this.registrations.set(workflowId, registration);
    }

    await Promise.all(pending);
  }

  async dispatchEvent(event: TriggerDispatchEvent): Promise<void> {
    const pending: Promise<void>[] = [];

    for (const [workflowId, registration] of this.registrations.entries()) {
      const trigger = registration.workflow.trigger;
      if (!trigger.enabled || trigger.type !== 'event' || !trigger.event) continue;
      if (this.inFlight.has(workflowId)) continue;
      if (trigger.event.eventType !== event.type) continue;

      if (event.type === 'keyword_match') {
        const keyword = trigger.event.keyword?.toLowerCase().trim();
        const haystack = event.text?.toLowerCase() ?? '';
        if (!keyword || !haystack.includes(keyword)) {
          continue;
        }
      }

      this.inFlight.add(workflowId);
      const runPromise = Promise.resolve(registration.callback(registration.workflow, trigger))
        .catch(() => {
          // Trigger callback errors are handled by caller execution logs.
        })
        .finally(() => {
          this.inFlight.delete(workflowId);
        });
      pending.push(runPromise);
    }

    await Promise.all(pending);
  }
}
