import { describe, expect, it } from 'vitest';
import { createSharedStore, createSharedApiClient } from '../../../shared/src';
import { createMobileAppRuntime } from '../app';
import { createOfflineSyncEngine } from '../sync';

describe('week 90 mobile architecture + shared core', () => {
  it('imports shared package and updates zustand store slices', () => {
    const store = createSharedStore('mobile');
    store.getState().upsertConversation({
      id: 'conv-1',
      title: 'Mobile First Conversation',
      unreadCount: 0,
    });

    store.getState().appendMessage({
      id: 'm1',
      conversationId: 'conv-1',
      role: 'user',
      text: 'hello mobile',
      createdAtIso: '2026-12-01T10:00:00.000Z',
    });

    expect(store.getState().conversations).toHaveLength(1);
    expect(store.getState().messagesByConversationId['conv-1']).toHaveLength(1);
  });

  it('creates mobile runtime with shared API client + sync engine', () => {
    const runtime = createMobileAppRuntime({
      apiBaseUrl: 'https://ashim.local',
      now: () => '2026-12-01T10:00:00.000Z',
    });

    expect(runtime.apiClient).toBeDefined();
    expect(runtime.syncEngine).toBeDefined();
    expect(runtime.store.getState().platform).toBe('mobile');
  });

  it('syncs queued operation when network executor succeeds', async () => {
    const syncEngine = createOfflineSyncEngine({
      nowIso: () => '2026-12-01T10:00:00.000Z',
    });

    syncEngine.enqueue({
      entityType: 'message',
      entityId: 'm1',
      workspaceId: 'ws-1',
      operation: 'create',
      payload: { text: 'offline queued message' },
    });

    const results = await syncEngine.flush({
      battery: {
        batteryPct: 0.8,
        isCharging: true,
        lowPowerMode: false,
      },
      execute: async () => ({ ok: true }),
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('synced');
    expect(syncEngine.queueDepth()).toBe(0);
  });

  it('normalizes API client network errors', async () => {
    const client = createSharedApiClient('https://ashim.local', async () => {
      throw new Error('network_down');
    });

    const response = await client.request({
      method: 'GET',
      path: '/v1/health',
    });

    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe('network_error');
  });
});
