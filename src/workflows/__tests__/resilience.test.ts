import { describe, expect, it } from 'vitest';
import {
  buildWorkflowResumePlan,
  listDeadLetterEscalations,
  shouldSkipStepForIdempotency,
} from '../resilience';
import type { StepResult, Workflow, WorkflowDeadLetterEntry } from '../types';

const makeWorkflow = (): Workflow => ({
  id: 'wf-10-steps',
  userId: 'user-1',
  name: 'Ten Step Workflow',
  description: 'resilience test',
  naturalLanguagePrompt: 'run 10 steps',
  trigger: {
    id: 'trigger-1',
    type: 'manual',
    enabled: true,
  },
  steps: Array.from({ length: 10 }).map((_, index) => ({
    id: `step-${index + 1}`,
    title: `Step ${index + 1}`,
    description: `Execute step ${index + 1}`,
    kind: 'transform' as const,
    actionId: `transform.step_${index + 1}`,
    status: 'idle' as const,
  })),
  status: 'ready',
  createdAtIso: '2026-02-18T00:00:00.000Z',
  updatedAtIso: '2026-02-18T00:00:00.000Z',
});

const makeCompletedResult = (stepId: string): StepResult => ({
  id: `result-${stepId}`,
  workflowId: 'wf-10-steps',
  stepId,
  status: 'completed',
  startedAtIso: '2026-02-18T00:00:00.000Z',
  finishedAtIso: '2026-02-18T00:00:01.000Z',
  durationMs: 1000,
  outputSummary: 'ok',
  outputPayload: {},
});

describe('workflow resilience helpers', () => {
  it('resumes from step 6 when process restarts after first 5 completed steps', () => {
    const workflow = makeWorkflow();
    const stepResults = workflow.steps.slice(0, 5).map((step) => makeCompletedResult(step.id));

    const plan = buildWorkflowResumePlan({
      workflow,
      stepResults,
    });

    expect(plan.resumeFromStepId).toBe('step-6');
    expect(plan.pendingStepIds[0]).toBe('step-6');
    expect(plan.completedStepIds).toContain('step-5');
  });

  it('enforces idempotent replay by skipping already-completed steps', () => {
    const stepResults = [makeCompletedResult('step-3')];
    expect(
      shouldSkipStepForIdempotency({
        stepId: 'step-3',
        stepResults,
      })
    ).toBe(true);
    expect(
      shouldSkipStepForIdempotency({
        stepId: 'step-4',
        stepResults,
      })
    ).toBe(false);
  });

  it('escalates pending dead-letter entries within five minutes', () => {
    const entries: WorkflowDeadLetterEntry[] = [
      {
        id: 'dlq-1',
        userId: 'user-1',
        workflowId: 'wf-1',
        triggerType: 'manual',
        reason: 'connector timeout',
        startedAtIso: '2026-02-18T10:00:00.000Z',
        finishedAtIso: '2026-02-18T10:01:00.000Z',
        stepResults: [],
        retryCount: 0,
        status: 'pending',
        createdAtIso: '2026-02-18T10:00:00.000Z',
        updatedAtIso: '2026-02-18T10:01:00.000Z',
      },
      {
        id: 'dlq-2',
        userId: 'user-1',
        workflowId: 'wf-2',
        triggerType: 'manual',
        reason: 'temporary',
        startedAtIso: '2026-02-18T10:04:00.000Z',
        finishedAtIso: '2026-02-18T10:04:30.000Z',
        stepResults: [],
        retryCount: 0,
        status: 'pending',
        createdAtIso: '2026-02-18T10:04:00.000Z',
        updatedAtIso: '2026-02-18T10:04:30.000Z',
      },
    ];

    const escalations = listDeadLetterEscalations({
      entries,
      nowIso: '2026-02-18T10:06:00.000Z',
      escalateAfterMinutes: 5,
    });
    expect(escalations).toHaveLength(1);
    expect(escalations[0].entryId).toBe('dlq-1');
  });
});
