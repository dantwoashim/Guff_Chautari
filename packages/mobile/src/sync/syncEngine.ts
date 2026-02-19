import { createMobileLocalStore, type MobileLocalStore } from './localStore';
import { resolveSyncWindow } from './batteryPolicy';
import type { BatteryTelemetry, SyncOperation, SyncResult } from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

export interface OfflineSyncEngine {
  enqueue: (payload: Omit<SyncOperation, 'id' | 'queuedAtIso' | 'attemptCount'>) => SyncOperation;
  flush: (payload: {
    battery: BatteryTelemetry;
    execute: (operation: SyncOperation) => Promise<{ ok: boolean; reason?: string }>;
  }) => Promise<SyncResult[]>;
  queueDepth: () => number;
  listQueued: () => SyncOperation[];
  reset: () => void;
}

export const createOfflineSyncEngine = (payload: {
  nowIso: () => string;
  setQueueDepth?: (depth: number) => void;
  store?: MobileLocalStore;
}): OfflineSyncEngine => {
  const store = payload.store ?? createMobileLocalStore();

  const updateDepth = () => {
    payload.setQueueDepth?.(store.queueDepth());
  };

  return {
    enqueue: (input) => {
      const operation: SyncOperation = {
        ...input,
        id: makeId('sync-op'),
        queuedAtIso: payload.nowIso(),
        attemptCount: 0,
      };
      store.enqueue(operation);
      updateDepth();
      return operation;
    },
    flush: async ({ battery, execute }) => {
      const window = resolveSyncWindow(battery);
      const batch = store.dequeueBatch(window.maxBatchSize);
      const results: SyncResult[] = [];

      for (const operation of batch) {
        try {
          const response = await execute({
            ...operation,
            attemptCount: operation.attemptCount + 1,
          });
          if (response.ok) {
            results.push({
              operationId: operation.id,
              status: 'synced',
            });
            continue;
          }

          const retried = {
            ...operation,
            attemptCount: operation.attemptCount + 1,
          };
          if (retried.attemptCount >= 4) {
            results.push({
              operationId: operation.id,
              status: 'failed',
              reason: response.reason ?? 'retry_budget_exhausted',
            });
          } else {
            store.requeue(retried);
            results.push({
              operationId: operation.id,
              status: 'retry',
              reason: response.reason ?? 'temporary_failure',
            });
          }
        } catch (error) {
          const retried = {
            ...operation,
            attemptCount: operation.attemptCount + 1,
          };
          if (retried.attemptCount >= 4) {
            results.push({
              operationId: operation.id,
              status: 'failed',
              reason: error instanceof Error ? error.message : 'sync_exception',
            });
          } else {
            store.requeue(retried);
            results.push({
              operationId: operation.id,
              status: 'retry',
              reason: error instanceof Error ? error.message : 'sync_exception',
            });
          }
        }
      }

      updateDepth();
      return results;
    },
    queueDepth: () => store.queueDepth(),
    listQueued: () => store.listQueued(),
    reset: () => {
      store.reset();
      updateDepth();
    },
  };
};
