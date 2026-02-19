import { createSharedStore } from '../../shared/src/store';
import { createSharedApiClient } from '../../shared/src/apiClient';
import type { SharedApiClient } from '../../shared/src/apiClient';
import { createOfflineSyncEngine, type OfflineSyncEngine } from './sync';

export interface MobileAppRuntime {
  apiClient: SharedApiClient;
  store: ReturnType<typeof createSharedStore>;
  syncEngine: OfflineSyncEngine;
}

export const createMobileAppRuntime = (payload: {
  apiBaseUrl: string;
  now: () => string;
}): MobileAppRuntime => {
  const store = createSharedStore('mobile');
  const apiClient = createSharedApiClient(payload.apiBaseUrl);
  const syncEngine = createOfflineSyncEngine({
    nowIso: payload.now,
    setQueueDepth: (depth) => store.getState().setSyncQueueDepth(depth),
  });

  return {
    apiClient,
    store,
    syncEngine,
  };
};
