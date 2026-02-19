import type {
  CheckpointProposedAction,
  StepResult,
  Workflow,
  WorkflowCheckpointDecision,
  WorkflowCheckpointRequest,
  WorkflowCheckpointRiskLevel,
  WorkflowCheckpointStatus,
  WorkflowStep,
} from './types';
import { runtimeWorkflowStateRepository } from '../data/repositories';
import { isSupabasePersistenceEnabled } from '../runtime/persistenceMode';

const STORAGE_PREFIX = 'ashim.workflows.checkpoints.v1';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const defaultList = (): WorkflowCheckpointRequest[] => [];

const parseWorkflowNamespaceUserId = (
  namespaceUserId: string
): { ownerUserId: string; workspaceId: string; namespaceUserId: string } | null => {
  const match = namespaceUserId.match(/^api:workflows:([^:]+):(.+)$/);
  if (!match) return null;
  return {
    ownerUserId: match[1],
    workspaceId: match[2],
    namespaceUserId,
  };
};

const inferRiskLevel = (
  previousResults: ReadonlyArray<StepResult>,
  remainingStepIds: ReadonlyArray<string>
): WorkflowCheckpointRiskLevel => {
  if (previousResults.some((result) => result.status === 'failed')) return 'high';
  if (remainingStepIds.length >= 3) return 'medium';
  return 'low';
};

const inferRiskSummary = (riskLevel: WorkflowCheckpointRiskLevel, checkpointStep: WorkflowStep): string => {
  if (riskLevel === 'high') {
    return `Checkpoint ${checkpointStep.title} flagged high risk based on earlier step outcomes.`;
  }
  if (riskLevel === 'medium') {
    return `Checkpoint ${checkpointStep.title} requires review before continuing through remaining steps.`;
  }
  return `Checkpoint ${checkpointStep.title} is a low-risk human confirmation gate.`;
};

const inferDefaultProposedAction = (workflow: Workflow, checkpointStepId: string): CheckpointProposedAction => {
  const index = workflow.steps.findIndex((step) => step.id === checkpointStepId);
  const nextStep = index >= 0 ? workflow.steps[index + 1] : null;

  if (nextStep) {
    return {
      title: nextStep.title,
      description: nextStep.description,
      actionId: nextStep.actionId,
      inputTemplate: nextStep.inputTemplate,
    };
  }

  return {
    title: 'Complete workflow',
    description: 'No remaining steps after this checkpoint.',
    actionId: 'workflow.complete',
  };
};

const readRaw = (key: string): string | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Fall back to memory adapter.
    }
  }
  return null;
};

const writeRaw = (key: string, value: string): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      // Fall back to memory adapter.
    }
  }
};

export interface WorkflowCheckpointStoreAdapter {
  load: (userId: string) => WorkflowCheckpointRequest[];
  save: (userId: string, requests: WorkflowCheckpointRequest[]) => void;
}

const createLocalStorageCheckpointStoreAdapter = (): WorkflowCheckpointStoreAdapter => {
  const memoryFallback = new Map<string, string>();

  const keyFor = (userId: string): string => `${STORAGE_PREFIX}.${userId}`;

  return {
    load(userId) {
      const key = keyFor(userId);
      const raw = readRaw(key) ?? memoryFallback.get(key) ?? null;
      if (!raw) return defaultList();

      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return defaultList();
        return parsed as WorkflowCheckpointRequest[];
      } catch {
        return defaultList();
      }
    },
    save(userId, requests) {
      const key = keyFor(userId);
      const payload = JSON.stringify(requests);
      writeRaw(key, payload);
      memoryFallback.set(key, payload);
    },
  };
};

const createSupabaseCheckpointStoreAdapter = (): WorkflowCheckpointStoreAdapter => {
  const localAdapter = createLocalStorageCheckpointStoreAdapter();
  const cache = new Map<string, WorkflowCheckpointRequest[]>();
  const hydrated = new Set<string>();

  const hydrateRemote = (namespaceUserId: string): void => {
    if (hydrated.has(namespaceUserId)) return;
    hydrated.add(namespaceUserId);

    const parsed = parseWorkflowNamespaceUserId(namespaceUserId);
    if (!parsed) return;

    void runtimeWorkflowStateRepository
      .loadState({
        userId: parsed.ownerUserId,
        workspaceId: parsed.workspaceId,
        namespaceUserId: `${parsed.namespaceUserId}:checkpoints`,
      })
      .then((snapshot) => {
        const entries = snapshot?.state?.checkpoints;
        if (!Array.isArray(entries)) return;
        const normalized = entries as WorkflowCheckpointRequest[];
        cache.set(namespaceUserId, [...normalized]);
        localAdapter.save(namespaceUserId, [...normalized]);
      })
      .catch(() => {
        // Keep local state on remote hydration errors.
      });
  };

  const persistRemote = (
    namespaceUserId: string,
    checkpoints: WorkflowCheckpointRequest[]
  ): void => {
    const parsed = parseWorkflowNamespaceUserId(namespaceUserId);
    if (!parsed) return;
    void runtimeWorkflowStateRepository.saveState({
      userId: parsed.ownerUserId,
      workspaceId: parsed.workspaceId,
      namespaceUserId: `${parsed.namespaceUserId}:checkpoints`,
      state: {
        checkpoints,
      },
      schemaVersion: 1,
      version: 1,
    });
  };

  return {
    load(namespaceUserId) {
      const cached = cache.get(namespaceUserId);
      if (cached) return [...cached];
      const local = localAdapter.load(namespaceUserId);
      cache.set(namespaceUserId, [...local]);
      hydrateRemote(namespaceUserId);
      return [...local];
    },
    save(namespaceUserId, requests) {
      const normalized = [...requests];
      cache.set(namespaceUserId, normalized);
      localAdapter.save(namespaceUserId, normalized);
      persistRemote(namespaceUserId, normalized);
    },
  };
};

export class WorkflowCheckpointManager {
  constructor(
    private readonly adapter: WorkflowCheckpointStoreAdapter = isSupabasePersistenceEnabled()
      ? createSupabaseCheckpointStoreAdapter()
      : createLocalStorageCheckpointStoreAdapter()
  ) {}

  list(userId: string, status?: WorkflowCheckpointStatus): WorkflowCheckpointRequest[] {
    const requests = this.adapter.load(userId);
    const filtered = status ? requests.filter((request) => request.status === status) : requests;

    return [...filtered].sort(
      (left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso)
    );
  }

  getById(userId: string, requestId: string): WorkflowCheckpointRequest | null {
    return this.adapter.load(userId).find((request) => request.id === requestId) ?? null;
  }

  create(payload: {
    userId: string;
    workflow: Workflow;
    executionId: string;
    checkpointStepId: string;
    previousStepResults: StepResult[];
    remainingStepIds: string[];
    riskLevel?: WorkflowCheckpointRiskLevel;
    riskSummary?: string;
    proposedAction?: CheckpointProposedAction;
    nowIso?: string;
  }): WorkflowCheckpointRequest {
    const checkpointStep = payload.workflow.steps.find((step) => step.id === payload.checkpointStepId);
    if (!checkpointStep) {
      throw new Error(`Checkpoint step ${payload.checkpointStepId} not found.`);
    }

    const riskLevel =
      payload.riskLevel ?? inferRiskLevel(payload.previousStepResults, payload.remainingStepIds);
    const request: WorkflowCheckpointRequest = {
      id: makeId('checkpoint'),
      userId: payload.userId,
      workflowId: payload.workflow.id,
      executionId: payload.executionId,
      checkpointStepId: payload.checkpointStepId,
      status: 'pending',
      createdAtIso: payload.nowIso ?? new Date().toISOString(),
      riskLevel,
      riskSummary: payload.riskSummary ?? inferRiskSummary(riskLevel, checkpointStep),
      proposedAction:
        payload.proposedAction ?? inferDefaultProposedAction(payload.workflow, payload.checkpointStepId),
      previousStepResults: [...payload.previousStepResults],
      remainingStepIds: [...payload.remainingStepIds],
    };

    const current = this.adapter.load(payload.userId);
    this.adapter.save(payload.userId, [request, ...current.filter((item) => item.id !== request.id)]);
    return request;
  }

  resolve(payload: {
    userId: string;
    requestId: string;
    decision: WorkflowCheckpointDecision;
    reviewerUserId: string;
    rejectionReason?: string;
    editedAction?: CheckpointProposedAction;
    resumedExecutionId?: string;
    nowIso?: string;
  }): WorkflowCheckpointRequest {
    const requests = this.adapter.load(payload.userId);
    let updatedRequest: WorkflowCheckpointRequest | null = null;

    const next = requests.map((request) => {
      if (request.id !== payload.requestId) return request;

      const decidedAtIso = payload.nowIso ?? new Date().toISOString();
      const status: WorkflowCheckpointStatus =
        payload.decision === 'approve'
          ? payload.resumedExecutionId
            ? 'resumed'
            : 'approved'
          : payload.decision === 'reject'
            ? 'rejected'
            : payload.resumedExecutionId
              ? 'resumed'
              : 'edited';

      const resolved: WorkflowCheckpointRequest = {
        ...request,
        status,
        decidedAtIso,
        decision: payload.decision,
        decisionByUserId: payload.reviewerUserId,
        rejectionReason:
          payload.decision === 'reject' ? payload.rejectionReason?.trim() || 'Rejected by reviewer.' : undefined,
        editedAction: payload.decision === 'edit' ? payload.editedAction : undefined,
        resumedExecutionId: payload.resumedExecutionId ?? request.resumedExecutionId,
      };

      updatedRequest = resolved;
      return resolved;
    });

    if (!updatedRequest) {
      throw new Error(`Checkpoint request ${payload.requestId} not found.`);
    }

    this.adapter.save(payload.userId, next);
    return updatedRequest;
  }
}

export const workflowCheckpointManager = new WorkflowCheckpointManager();

export const createInMemoryWorkflowCheckpointStoreAdapter = (): WorkflowCheckpointStoreAdapter => {
  const map = new Map<string, WorkflowCheckpointRequest[]>();

  return {
    load(userId) {
      return map.get(userId) ?? [];
    },
    save(userId, requests) {
      map.set(userId, [...requests]);
    },
  };
};

export const createSupabaseWorkflowCheckpointStoreAdapterForRuntime =
  (): WorkflowCheckpointStoreAdapter => createSupabaseCheckpointStoreAdapter();
