import type { SyncOperation } from './types';

export interface MobileLocalStore {
  enqueue: (operation: SyncOperation) => void;
  dequeueBatch: (maxBatchSize: number) => SyncOperation[];
  requeue: (operation: SyncOperation) => void;
  listQueued: () => SyncOperation[];
  queueDepth: () => number;
  reset: () => void;
}

export const createMobileLocalStore = (): MobileLocalStore => {
  const queue: SyncOperation[] = [];

  return {
    enqueue: (operation) => {
      queue.push(operation);
    },
    dequeueBatch: (maxBatchSize) => {
      if (maxBatchSize <= 0) return [];
      return queue.splice(0, maxBatchSize);
    },
    requeue: (operation) => {
      queue.unshift(operation);
    },
    listQueued: () => [...queue],
    queueDepth: () => queue.length,
    reset: () => {
      queue.splice(0, queue.length);
    },
  };
};
