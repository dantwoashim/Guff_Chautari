import { defaultSupabaseClient, SupabaseLike } from './base';

const toRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const toNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

export interface RuntimeWorkflowStateSnapshot {
  id: string;
  userId: string;
  workspaceId: string;
  namespaceUserId: string;
  state: Record<string, unknown>;
  schemaVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const toSnapshot = (row: unknown): RuntimeWorkflowStateSnapshot => {
  const source = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    id: String(source.id ?? ''),
    userId: String(source.user_id ?? ''),
    workspaceId: String(source.workspace_id ?? ''),
    namespaceUserId: String(source.namespace_user_id ?? ''),
    state: toRecord(source.state),
    schemaVersion: toNumber(source.schema_version, 1),
    version: toNumber(source.version, 1),
    createdAt: String(source.created_at ?? ''),
    updatedAt: String(source.updated_at ?? ''),
  };
};

export class RuntimeWorkflowStateRepository {
  constructor(private readonly client: SupabaseLike = defaultSupabaseClient) {}

  async loadState(payload: {
    userId: string;
    workspaceId: string;
    namespaceUserId: string;
  }): Promise<RuntimeWorkflowStateSnapshot | null> {
    const { data, error } = await this.client
      .from('runtime_workflow_state')
      .select('*')
      .eq('user_id', payload.userId)
      .eq('workspace_id', payload.workspaceId)
      .eq('namespace_user_id', payload.namespaceUserId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toSnapshot(data);
  }

  async saveState(payload: {
    userId: string;
    workspaceId: string;
    namespaceUserId: string;
    state: Record<string, unknown>;
    schemaVersion?: number;
    version?: number;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await this.client.from('runtime_workflow_state').upsert({
      user_id: payload.userId,
      workspace_id: payload.workspaceId,
      namespace_user_id: payload.namespaceUserId,
      state: payload.state,
      schema_version: payload.schemaVersion ?? 1,
      version: payload.version ?? 1,
      updated_at: nowIso,
    });
    if (error) throw error;
  }
}

export const runtimeWorkflowStateRepository = new RuntimeWorkflowStateRepository();
