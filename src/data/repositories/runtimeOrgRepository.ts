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

export interface RuntimeOrgStateSnapshot {
  id: string;
  userId: string;
  organizationId: string;
  payload: Record<string, unknown>;
  schemaVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const toSnapshot = (row: unknown): RuntimeOrgStateSnapshot => {
  const source = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    id: String(source.id ?? ''),
    userId: String(source.user_id ?? ''),
    organizationId: String(source.organization_id ?? ''),
    payload: toRecord(source.payload),
    schemaVersion: toNumber(source.schema_version, 1),
    version: toNumber(source.version, 1),
    createdAt: String(source.created_at ?? ''),
    updatedAt: String(source.updated_at ?? ''),
  };
};

export class RuntimeOrgRepository {
  constructor(private readonly client: SupabaseLike = defaultSupabaseClient) {}

  async saveState(payload: {
    userId: string;
    organizationId: string;
    state: Record<string, unknown>;
    schemaVersion?: number;
    version?: number;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await this.client.from('runtime_org_state').upsert({
      user_id: payload.userId,
      organization_id: payload.organizationId,
      payload: payload.state,
      schema_version: payload.schemaVersion ?? 1,
      version: payload.version ?? 1,
      updated_at: nowIso,
    });
    if (error) throw error;
  }

  async loadState(payload: {
    userId: string;
    organizationId: string;
  }): Promise<RuntimeOrgStateSnapshot | null> {
    const { data, error } = await this.client
      .from('runtime_org_state')
      .select('*')
      .eq('user_id', payload.userId)
      .eq('organization_id', payload.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toSnapshot(data);
  }
}

export const runtimeOrgRepository = new RuntimeOrgRepository();
