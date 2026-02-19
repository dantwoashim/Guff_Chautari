import type { Message } from '../../types';

const STORAGE_KEY = 'ashim.offline.message-queue.v1';
export const OFFLINE_QUEUE_UPDATED_EVENT = 'ashim:offline-queue-updated';
export type QueuedMessagePriority = 'high' | 'normal' | 'low';

const priorityWeight: Record<QueuedMessagePriority, number> = {
  high: 3,
  normal: 2,
  low: 1,
};

export interface QueuedMessageRecord {
  queueId: string;
  sessionId: string;
  userId: string;
  message: Message;
  traceId: string;
  enqueuedAtIso: string;
  priority?: QueuedMessagePriority;
  attempts: number;
  lastError?: string;
}

const canUseStorage = (): boolean => {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
};

const readQueueUnsafe = (): QueuedMessageRecord[] => {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedMessageRecord[]) : [];
  } catch {
    return [];
  }
};

const emitQueueUpdated = (size: number): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(OFFLINE_QUEUE_UPDATED_EVENT, {
      detail: { size },
    })
  );
};

const writeQueueUnsafe = (queue: QueuedMessageRecord[]): void => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore storage failures to keep runtime non-blocking.
  }
  emitQueueUpdated(queue.length);
};

export const listQueuedMessages = (sessionId?: string): QueuedMessageRecord[] => {
  const all = readQueueUnsafe();
  const filtered = sessionId ? all.filter((record) => record.sessionId === sessionId) : all;
  return [...filtered].sort((left, right) => {
    const leftPriority = priorityWeight[left.priority ?? 'normal'];
    const rightPriority = priorityWeight[right.priority ?? 'normal'];
    if (leftPriority !== rightPriority) return rightPriority - leftPriority;
    return Date.parse(left.enqueuedAtIso) - Date.parse(right.enqueuedAtIso);
  });
};

export const getQueuedMessageCount = (sessionId?: string): number => {
  return listQueuedMessages(sessionId).length;
};

export const enqueueMessage = (record: QueuedMessageRecord): void => {
  const queue = readQueueUnsafe();
  const exists = queue.some((entry) => entry.queueId === record.queueId);
  if (exists) return;
  writeQueueUnsafe([
    ...queue,
    {
      ...record,
      priority: record.priority ?? 'normal',
    },
  ]);
};

export const removeQueuedMessage = (queueId: string): void => {
  const queue = readQueueUnsafe();
  writeQueueUnsafe(queue.filter((entry) => entry.queueId !== queueId));
};

export const updateQueuedMessage = (
  queueId: string,
  updater: (record: QueuedMessageRecord) => QueuedMessageRecord
): void => {
  const queue = readQueueUnsafe();
  writeQueueUnsafe(queue.map((entry) => (entry.queueId === queueId ? updater(entry) : entry)));
};

export const clearQueuedMessages = (): void => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  emitQueueUpdated(0);
};

export const setQueuedMessagePriority = (
  queueId: string,
  priority: QueuedMessagePriority
): void => {
  updateQueuedMessage(queueId, (record) => ({
    ...record,
    priority,
  }));
};
