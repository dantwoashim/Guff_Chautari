import type { StepResult, Workflow, WorkflowDeadLetterEntry } from './types';

export interface WorkflowResumePlan {
  workflowId: string;
  resumeFromStepId: string | null;
  completedStepIds: string[];
  pendingStepIds: string[];
}

export interface DeadLetterEscalation {
  entryId: string;
  workflowId: string;
  ageMinutes: number;
  reason: string;
}

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const buildWorkflowResumePlan = (payload: {
  workflow: Workflow;
  stepResults: ReadonlyArray<StepResult>;
}): WorkflowResumePlan => {
  const completedStepIds = new Set(
    payload.stepResults
      .filter((result) => result.status === 'completed')
      .map((result) => result.stepId)
  );

  const orderedStepIds = payload.workflow.steps.map((step) => step.id);
  const pendingStepIds = orderedStepIds.filter((stepId) => !completedStepIds.has(stepId));
  const resumeFromStepId = pendingStepIds[0] ?? null;

  return {
    workflowId: payload.workflow.id,
    resumeFromStepId,
    completedStepIds: [...completedStepIds],
    pendingStepIds,
  };
};

export const shouldSkipStepForIdempotency = (payload: {
  stepId: string;
  stepResults: ReadonlyArray<StepResult>;
}): boolean => {
  return payload.stepResults.some(
    (result) => result.stepId === payload.stepId && result.status === 'completed'
  );
};

export const listDeadLetterEscalations = (payload: {
  entries: ReadonlyArray<WorkflowDeadLetterEntry>;
  nowIso?: string;
  escalateAfterMinutes?: number;
}): DeadLetterEscalation[] => {
  const nowMs = toMs(payload.nowIso ?? new Date().toISOString());
  const thresholdMinutes = Math.max(1, payload.escalateAfterMinutes ?? 5);

  return payload.entries
    .filter((entry) => entry.status === 'pending')
    .map((entry) => {
      const ageMinutes = (nowMs - toMs(entry.createdAtIso)) / (60 * 1000);
      return {
        entryId: entry.id,
        workflowId: entry.workflowId,
        ageMinutes: Number(ageMinutes.toFixed(2)),
        reason: entry.reason,
      };
    })
    .filter((entry) => entry.ageMinutes >= thresholdMinutes)
    .sort((left, right) => right.ageMinutes - left.ageMinutes);
};
