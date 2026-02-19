import { runtimeWorkflowStateRepository } from '../data/repositories';
import { isSupabasePersistenceEnabled } from '../runtime/persistenceMode';
import type {
  Workflow,
  WorkflowExecution,
  WorkflowInboxArtifact,
  WorkflowNotification,
  WorkflowState,
  WorkflowStoreAdapter,
} from './types';

const STORAGE_PREFIX = 'ashim.workflows.v1';

const emptyState = (): WorkflowState => ({
  workflows: [],
  executions: [],
  artifacts: [],
  notifications: [],
  updatedAtIso: new Date(0).toISOString(),
});

const isValidState = (value: unknown): value is WorkflowState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkflowState>;
  return (
    Array.isArray(candidate.workflows) &&
    Array.isArray(candidate.executions) &&
    Array.isArray(candidate.artifacts) &&
    Array.isArray(candidate.notifications)
  );
};

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

const createLocalStorageAdapter = (): WorkflowStoreAdapter => {
  const memoryFallback = new Map<string, string>();

  const keyFor = (userId: string): string => `${STORAGE_PREFIX}.${userId}`;

  const loadRaw = (key: string): string | null => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        // Fall through to memory fallback.
      }
    }
    return memoryFallback.get(key) ?? null;
  };

  const saveRaw = (key: string, value: string): void => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        // Fall through to memory fallback.
      }
    }
    memoryFallback.set(key, value);
  };

  return {
    load(userId) {
      const raw = loadRaw(keyFor(userId));
      if (!raw) return emptyState();

      try {
        const parsed = JSON.parse(raw);
        if (!isValidState(parsed)) return emptyState();
        return {
          workflows: parsed.workflows,
          executions: parsed.executions,
          artifacts: parsed.artifacts,
          notifications: parsed.notifications,
          updatedAtIso:
            typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
        };
      } catch {
        return emptyState();
      }
    },
    save(userId, state) {
      saveRaw(keyFor(userId), JSON.stringify(state));
    },
  };
};

const createSupabaseWorkflowStoreAdapter = (): WorkflowStoreAdapter => {
  const localAdapter = createLocalStorageAdapter();
  const cache = new Map<string, WorkflowState>();
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
        namespaceUserId: parsed.namespaceUserId,
      })
      .then((snapshot) => {
        if (!snapshot) return;
        const rawState = snapshot.state.workflowState;
        if (!isValidState(rawState)) return;
        const normalized: WorkflowState = {
          workflows: [...rawState.workflows],
          executions: [...rawState.executions],
          artifacts: [...rawState.artifacts],
          notifications: [...rawState.notifications],
          updatedAtIso:
            typeof rawState.updatedAtIso === 'string'
              ? rawState.updatedAtIso
              : new Date().toISOString(),
        };
        cache.set(namespaceUserId, normalized);
        localAdapter.save(namespaceUserId, normalized);
      })
      .catch(() => {
        // Keep local state on remote hydration errors.
      });
  };

  const persistRemote = (namespaceUserId: string, state: WorkflowState): void => {
    const parsed = parseWorkflowNamespaceUserId(namespaceUserId);
    if (!parsed) return;
    void runtimeWorkflowStateRepository.saveState({
      userId: parsed.ownerUserId,
      workspaceId: parsed.workspaceId,
      namespaceUserId: parsed.namespaceUserId,
      state: {
        workflowState: state,
      },
      schemaVersion: 1,
      version: 1,
    });
  };

  return {
    load(namespaceUserId) {
      const cached = cache.get(namespaceUserId);
      if (cached) return cached;
      const local = localAdapter.load(namespaceUserId);
      cache.set(namespaceUserId, local);
      hydrateRemote(namespaceUserId);
      return local;
    },
    save(namespaceUserId, state) {
      const normalized: WorkflowState = {
        ...state,
        workflows: [...state.workflows],
        executions: [...state.executions],
        artifacts: [...state.artifacts],
        notifications: [...state.notifications],
      };
      cache.set(namespaceUserId, normalized);
      localAdapter.save(namespaceUserId, normalized);
      persistRemote(namespaceUserId, normalized);
    },
  };
};

export class WorkflowStore {
  constructor(
    private readonly adapter: WorkflowStoreAdapter = isSupabasePersistenceEnabled()
      ? createSupabaseWorkflowStoreAdapter()
      : createLocalStorageAdapter()
  ) {}

  load(userId: string): WorkflowState {
    return this.adapter.load(userId);
  }

  save(userId: string, state: WorkflowState): void {
    this.adapter.save(userId, state);
  }

  update(userId: string, updater: (state: WorkflowState) => WorkflowState): WorkflowState {
    const current = this.load(userId);
    const next = updater(current);
    const normalized: WorkflowState = {
      ...next,
      workflows: [...next.workflows],
      executions: [...next.executions],
      artifacts: [...next.artifacts],
      notifications: [...next.notifications],
      updatedAtIso: new Date().toISOString(),
    };
    this.save(userId, normalized);
    return normalized;
  }

  listWorkflows(userId: string): Workflow[] {
    return this.load(userId).workflows;
  }

  upsertWorkflow(userId: string, workflow: Workflow): Workflow {
    this.update(userId, (state) => ({
      ...state,
      workflows: [workflow, ...state.workflows.filter((item) => item.id !== workflow.id)],
    }));
    return workflow;
  }

  getWorkflow(userId: string, workflowId: string): Workflow | null {
    return this.load(userId).workflows.find((workflow) => workflow.id === workflowId) ?? null;
  }

  listExecutions(userId: string, workflowId?: string): WorkflowExecution[] {
    const executions = this.load(userId).executions;
    return workflowId ? executions.filter((item) => item.workflowId === workflowId) : executions;
  }

  appendExecution(userId: string, execution: WorkflowExecution): WorkflowExecution {
    this.update(userId, (state) => ({
      ...state,
      executions: [execution, ...state.executions.filter((item) => item.id !== execution.id)],
    }));
    return execution;
  }

  appendArtifact(userId: string, artifact: WorkflowInboxArtifact): WorkflowInboxArtifact {
    this.update(userId, (state) => ({
      ...state,
      artifacts: [artifact, ...state.artifacts.filter((item) => item.id !== artifact.id)],
    }));
    return artifact;
  }

  listArtifacts(userId: string): WorkflowInboxArtifact[] {
    return this.load(userId).artifacts;
  }

  appendNotification(userId: string, notification: WorkflowNotification): WorkflowNotification {
    this.update(userId, (state) => ({
      ...state,
      notifications: [notification, ...state.notifications.filter((item) => item.id !== notification.id)],
    }));
    return notification;
  }

  listNotifications(userId: string): WorkflowNotification[] {
    return this.load(userId).notifications;
  }

  markNotificationRead(userId: string, notificationId: string): void {
    this.update(userId, (state) => ({
      ...state,
      notifications: state.notifications.map((item) =>
        item.id === notificationId ? { ...item, read: true } : item
      ),
    }));
  }
}

export const workflowStore = new WorkflowStore();

export const createInMemoryWorkflowStoreAdapter = (): WorkflowStoreAdapter => {
  const map = new Map<string, WorkflowState>();
  return {
    load(userId) {
      return map.get(userId) ?? emptyState();
    },
    save(userId, state) {
      map.set(userId, {
        ...state,
        workflows: [...state.workflows],
        executions: [...state.executions],
        artifacts: [...state.artifacts],
        notifications: [...state.notifications],
      });
    },
  };
};

export const createSupabaseWorkflowStoreAdapterForRuntime = (): WorkflowStoreAdapter =>
  createSupabaseWorkflowStoreAdapter();
