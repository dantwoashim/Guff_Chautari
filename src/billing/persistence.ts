import { runtimeBillingRepository } from '../data/repositories';
import { isSupabasePersistenceEnabled } from '../runtime/persistenceMode';
import type { BillingRuntime, PersistedWorkspaceBillingState } from './runtime';

const WORKSPACE_SCOPE_TYPE = 'workspace';
const BILLING_PERSISTENCE_SCHEMA_VERSION = 1;
const BILLING_PERSISTENCE_VERSION = 1;

const hydratedWorkspaceScopes = new Set<string>();

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const isPersistedWorkspaceBillingState = (value: unknown): value is PersistedWorkspaceBillingState => {
  const candidate = asRecord(value);
  if (!candidate) return false;
  const workspaceId = candidate.workspaceId;
  const account = asRecord(candidate.account);
  if (typeof workspaceId !== 'string' || workspaceId.trim().length === 0) return false;
  if (!account || typeof account.workspaceId !== 'string') return false;
  if (!Array.isArray(candidate.invoices)) return false;
  if (!Array.isArray(candidate.usageRecords)) return false;
  return true;
};

const hydrationKey = (userId: string, workspaceId: string): string => `${userId}::${workspaceId}`;

const extractPersistedWorkspaceState = (payload: Record<string, unknown>): PersistedWorkspaceBillingState | null => {
  const nested = payload.workspace;
  if (isPersistedWorkspaceBillingState(nested)) return nested;
  if (isPersistedWorkspaceBillingState(payload)) {
    return payload;
  }
  return null;
};

export const hydrateWorkspaceBillingState = async (payload: {
  runtime: BillingRuntime;
  userId: string;
  workspaceId: string;
}): Promise<boolean> => {
  if (!isSupabasePersistenceEnabled()) return false;
  if (!payload.userId || !payload.workspaceId) return false;

  const key = hydrationKey(payload.userId, payload.workspaceId);
  if (hydratedWorkspaceScopes.has(key)) return false;
  hydratedWorkspaceScopes.add(key);

  try {
    const snapshot = await runtimeBillingRepository.loadState({
      userId: payload.userId,
      scopeType: WORKSPACE_SCOPE_TYPE,
      scopeId: payload.workspaceId,
    });
    if (!snapshot) return false;

    const statePayload = asRecord(snapshot.payload);
    if (!statePayload) return false;

    const state = extractPersistedWorkspaceState(statePayload);
    if (!state) return false;

    payload.runtime.hydrateWorkspaceState(state);
    return true;
  } catch {
    return false;
  }
};

export const persistWorkspaceBillingState = async (payload: {
  runtime: BillingRuntime;
  userId: string;
  workspaceId: string;
}): Promise<boolean> => {
  if (!isSupabasePersistenceEnabled()) return false;
  if (!payload.userId || !payload.workspaceId) return false;

  const state = payload.runtime.captureWorkspaceState(payload.workspaceId);
  if (!state) return false;

  try {
    await runtimeBillingRepository.saveState({
      userId: payload.userId,
      scopeType: WORKSPACE_SCOPE_TYPE,
      scopeId: payload.workspaceId,
      state: {
        workspace: state,
      },
      schemaVersion: BILLING_PERSISTENCE_SCHEMA_VERSION,
      version: BILLING_PERSISTENCE_VERSION,
    });
    return true;
  } catch {
    return false;
  }
};

export const resetBillingPersistenceHydrationForTests = (): void => {
  hydratedWorkspaceScopes.clear();
};
