import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearQueuedMessages,
  enqueueMessage,
  listQueuedMessages,
  setQueuedMessagePriority,
} from '../messageQueue';

const buildMessage = (id: string) => ({
  id,
  role: 'user' as const,
  text: `message-${id}`,
  timestamp: Date.now(),
});

describe('offline message queue', () => {
  beforeEach(() => {
    clearQueuedMessages();
  });

  it('orders queued messages by priority then enqueue timestamp', () => {
    enqueueMessage({
      queueId: 'q-low',
      sessionId: 'session-1',
      userId: 'user-1',
      message: buildMessage('m-low'),
      traceId: 'trace-low',
      enqueuedAtIso: '2026-02-18T10:00:02.000Z',
      priority: 'low',
      attempts: 0,
    });
    enqueueMessage({
      queueId: 'q-high',
      sessionId: 'session-1',
      userId: 'user-1',
      message: buildMessage('m-high'),
      traceId: 'trace-high',
      enqueuedAtIso: '2026-02-18T10:00:03.000Z',
      priority: 'high',
      attempts: 0,
    });
    enqueueMessage({
      queueId: 'q-normal',
      sessionId: 'session-1',
      userId: 'user-1',
      message: buildMessage('m-normal'),
      traceId: 'trace-normal',
      enqueuedAtIso: '2026-02-18T10:00:01.000Z',
      priority: 'normal',
      attempts: 0,
    });

    const queue = listQueuedMessages('session-1');
    expect(queue.map((entry) => entry.queueId)).toEqual(['q-high', 'q-normal', 'q-low']);
  });

  it('updates priority in place for queue management UI', () => {
    enqueueMessage({
      queueId: 'q-1',
      sessionId: 'session-2',
      userId: 'user-2',
      message: buildMessage('m-1'),
      traceId: 'trace-1',
      enqueuedAtIso: '2026-02-18T10:00:00.000Z',
      attempts: 0,
    });

    setQueuedMessagePriority('q-1', 'high');
    const updated = listQueuedMessages('session-2');
    expect(updated[0].priority).toBe('high');
  });
});
