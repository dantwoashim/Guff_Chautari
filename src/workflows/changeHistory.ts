import type { Workflow } from './types';
import { runtimeWorkflowStateRepository } from '../data/repositories';
import { isSupabasePersistenceEnabled } from '../runtime/persistenceMode';

const STORAGE_PREFIX = 'ashim.workflows.history.v1';

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

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

export type WorkflowChangeType =
  | 'workflow_created'
  | 'workflow_updated'
  | 'plan_modified'
  | 'checkpoint_decision'
  | 'checkpoint_resumed';

export interface WorkflowStepSnapshot {
  id: string;
  title: string;
  description: string;
  kind: Workflow['steps'][number]['kind'];
  actionId: string;
  inputTemplate?: string;
}

export interface WorkflowBranchSnapshot {
  id: string;
  fromStepId: string;
  toStepId: string;
  label: string;
  priority: number;
  operator: string;
  sourcePath: string;
}

export interface WorkflowSnapshot {
  id: string;
  name: string;
  description: string;
  stepSnapshots: WorkflowStepSnapshot[];
  branchSnapshots: WorkflowBranchSnapshot[];
  capturedAtIso: string;
}

export interface WorkflowChangeEntry {
  id: string;
  userId: string;
  workflowId: string;
  changeType: WorkflowChangeType;
  summary: string;
  createdAtIso: string;
  beforeSnapshot?: WorkflowSnapshot;
  afterSnapshot?: WorkflowSnapshot;
  metadata?: Record<string, unknown>;
}

export interface WorkflowChangeDiff {
  addedStepIds: string[];
  removedStepIds: string[];
  changedStepIds: string[];
  addedBranchIds: string[];
  removedBranchIds: string[];
  changedBranchIds: string[];
}

export interface WorkflowChangeStoreAdapter {
  load: (userId: string) => WorkflowChangeEntry[];
  save: (userId: string, entries: WorkflowChangeEntry[]) => void;
}

const defaultEntries = (): WorkflowChangeEntry[] => [];

const readRaw = (key: string): string | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Fall back to memory storage.
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
      // Fall back to memory storage.
    }
  }
};

const createLocalStorageChangeHistoryAdapter = (): WorkflowChangeStoreAdapter => {
  const memoryFallback = new Map<string, string>();

  const keyFor = (userId: string): string => `${STORAGE_PREFIX}.${userId}`;

  return {
    load(userId) {
      const key = keyFor(userId);
      const raw = readRaw(key) ?? memoryFallback.get(key) ?? null;
      if (!raw) return defaultEntries();

      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return defaultEntries();
        return parsed as WorkflowChangeEntry[];
      } catch {
        return defaultEntries();
      }
    },
    save(userId, entries) {
      const key = keyFor(userId);
      const payload = JSON.stringify(entries);
      writeRaw(key, payload);
      memoryFallback.set(key, payload);
    },
  };
};

const createSupabaseChangeHistoryAdapter = (): WorkflowChangeStoreAdapter => {
  const localAdapter = createLocalStorageChangeHistoryAdapter();
  const cache = new Map<string, WorkflowChangeEntry[]>();
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
        namespaceUserId: `${parsed.namespaceUserId}:change-history`,
      })
      .then((snapshot) => {
        const entries = snapshot?.state?.changeHistory;
        if (!Array.isArray(entries)) return;
        const normalized = entries as WorkflowChangeEntry[];
        cache.set(namespaceUserId, [...normalized]);
        localAdapter.save(namespaceUserId, [...normalized]);
      })
      .catch(() => {
        // Keep local state on remote hydration errors.
      });
  };

  const persistRemote = (namespaceUserId: string, entries: WorkflowChangeEntry[]): void => {
    const parsed = parseWorkflowNamespaceUserId(namespaceUserId);
    if (!parsed) return;
    void runtimeWorkflowStateRepository.saveState({
      userId: parsed.ownerUserId,
      workspaceId: parsed.workspaceId,
      namespaceUserId: `${parsed.namespaceUserId}:change-history`,
      state: {
        changeHistory: entries,
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
    save(namespaceUserId, entries) {
      const normalized = [...entries];
      cache.set(namespaceUserId, normalized);
      localAdapter.save(namespaceUserId, normalized);
      persistRemote(namespaceUserId, normalized);
    },
  };
};

export const snapshotWorkflow = (workflow: Workflow, capturedAtIso = new Date().toISOString()): WorkflowSnapshot => {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    stepSnapshots: workflow.steps.map((step) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      kind: step.kind,
      actionId: step.actionId,
      inputTemplate: step.inputTemplate,
    })),
    branchSnapshots: (workflow.planGraph?.branches ?? []).map((branch) => ({
      id: branch.id,
      fromStepId: branch.fromStepId,
      toStepId: branch.toStepId,
      label: branch.label,
      priority: branch.priority,
      operator: branch.condition.operator,
      sourcePath: branch.condition.sourcePath,
    })),
    capturedAtIso,
  };
};

export const diffWorkflowSnapshots = (
  before: WorkflowSnapshot | undefined,
  after: WorkflowSnapshot | undefined
): WorkflowChangeDiff => {
  const beforeSteps = new Map((before?.stepSnapshots ?? []).map((step) => [step.id, step]));
  const afterSteps = new Map((after?.stepSnapshots ?? []).map((step) => [step.id, step]));

  const addedStepIds: string[] = [];
  const removedStepIds: string[] = [];
  const changedStepIds: string[] = [];

  for (const [stepId, step] of afterSteps.entries()) {
    const previous = beforeSteps.get(stepId);
    if (!previous) {
      addedStepIds.push(stepId);
      continue;
    }

    if (
      previous.title !== step.title ||
      previous.description !== step.description ||
      previous.kind !== step.kind ||
      previous.actionId !== step.actionId ||
      previous.inputTemplate !== step.inputTemplate
    ) {
      changedStepIds.push(stepId);
    }
  }

  for (const stepId of beforeSteps.keys()) {
    if (!afterSteps.has(stepId)) {
      removedStepIds.push(stepId);
    }
  }

  const beforeBranches = new Map((before?.branchSnapshots ?? []).map((branch) => [branch.id, branch]));
  const afterBranches = new Map((after?.branchSnapshots ?? []).map((branch) => [branch.id, branch]));

  const addedBranchIds: string[] = [];
  const removedBranchIds: string[] = [];
  const changedBranchIds: string[] = [];

  for (const [branchId, branch] of afterBranches.entries()) {
    const previous = beforeBranches.get(branchId);
    if (!previous) {
      addedBranchIds.push(branchId);
      continue;
    }

    if (
      previous.fromStepId !== branch.fromStepId ||
      previous.toStepId !== branch.toStepId ||
      previous.label !== branch.label ||
      previous.priority !== branch.priority ||
      previous.operator !== branch.operator ||
      previous.sourcePath !== branch.sourcePath
    ) {
      changedBranchIds.push(branchId);
    }
  }

  for (const branchId of beforeBranches.keys()) {
    if (!afterBranches.has(branchId)) {
      removedBranchIds.push(branchId);
    }
  }

  return {
    addedStepIds,
    removedStepIds,
    changedStepIds,
    addedBranchIds,
    removedBranchIds,
    changedBranchIds,
  };
};

export class WorkflowChangeHistory {
  constructor(
    private readonly adapter: WorkflowChangeStoreAdapter = isSupabasePersistenceEnabled()
      ? createSupabaseChangeHistoryAdapter()
      : createLocalStorageChangeHistoryAdapter()
  ) {}

  append(payload: {
    userId: string;
    workflowId: string;
    changeType: WorkflowChangeType;
    summary: string;
    beforeSnapshot?: WorkflowSnapshot;
    afterSnapshot?: WorkflowSnapshot;
    metadata?: Record<string, unknown>;
    createdAtIso?: string;
  }): WorkflowChangeEntry {
    const entry: WorkflowChangeEntry = {
      id: makeId('workflow-change'),
      userId: payload.userId,
      workflowId: payload.workflowId,
      changeType: payload.changeType,
      summary: payload.summary,
      beforeSnapshot: payload.beforeSnapshot,
      afterSnapshot: payload.afterSnapshot,
      metadata: payload.metadata,
      createdAtIso: payload.createdAtIso ?? new Date().toISOString(),
    };

    const current = this.adapter.load(payload.userId);
    this.adapter.save(payload.userId, [entry, ...current]);
    return entry;
  }

  list(payload: {
    userId: string;
    workflowId?: string;
    limit?: number;
  }): WorkflowChangeEntry[] {
    const entries = this.adapter.load(payload.userId);
    const filtered = payload.workflowId
      ? entries.filter((entry) => entry.workflowId === payload.workflowId)
      : entries;
    const limit = Math.max(1, payload.limit ?? 50);

    return [...filtered]
      .sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso))
      .slice(0, limit);
  }

  diffEntrySnapshots(payload: {
    left: WorkflowChangeEntry;
    right: WorkflowChangeEntry;
  }): WorkflowChangeDiff {
    return diffWorkflowSnapshots(payload.left.afterSnapshot, payload.right.afterSnapshot);
  }

  recordWorkflowSave(payload: {
    userId: string;
    workflowId: string;
    before?: Workflow;
    after: Workflow;
    summary?: string;
    createdAtIso?: string;
  }): WorkflowChangeEntry {
    const beforeSnapshot = payload.before ? snapshotWorkflow(payload.before, payload.createdAtIso) : undefined;
    const afterSnapshot = snapshotWorkflow(payload.after, payload.createdAtIso);

    const changeType: WorkflowChangeType = payload.before ? 'plan_modified' : 'workflow_created';

    return this.append({
      userId: payload.userId,
      workflowId: payload.workflowId,
      changeType,
      summary:
        payload.summary ??
        (payload.before
          ? `Workflow ${payload.after.name} updated via save operation.`
          : `Workflow ${payload.after.name} created.`),
      beforeSnapshot,
      afterSnapshot,
      createdAtIso: payload.createdAtIso,
    });
  }
}

export const workflowChangeHistory = new WorkflowChangeHistory();

export const createInMemoryWorkflowChangeStoreAdapter = (): WorkflowChangeStoreAdapter => {
  const map = new Map<string, WorkflowChangeEntry[]>();

  return {
    load(userId) {
      return map.get(userId) ?? [];
    },
    save(userId, entries) {
      map.set(userId, [...entries]);
    },
  };
};

export const createSupabaseWorkflowChangeStoreAdapterForRuntime =
  (): WorkflowChangeStoreAdapter => createSupabaseChangeHistoryAdapter();
