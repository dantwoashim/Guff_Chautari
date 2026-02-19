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

export interface RuntimeBillingStateSnapshot {
  id: string;
  userId: string;
  scopeType: string;
  scopeId: string;
  payload: Record<string, unknown>;
  schemaVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const toSnapshot = (row: unknown): RuntimeBillingStateSnapshot => {
  const source = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    id: String(source.id ?? ''),
    userId: String(source.user_id ?? ''),
    scopeType: String(source.scope_type ?? ''),
    scopeId: String(source.scope_id ?? ''),
    payload: toRecord(source.payload),
    schemaVersion: toNumber(source.schema_version, 1),
    version: toNumber(source.version, 1),
    createdAt: String(source.created_at ?? ''),
    updatedAt: String(source.updated_at ?? ''),
  };
};

export class RuntimeBillingRepository {
  constructor(private readonly client: SupabaseLike = defaultSupabaseClient) {}

  async saveState(payload: {
    userId: string;
    scopeType: string;
    scopeId: string;
    state: Record<string, unknown>;
    schemaVersion?: number;
    version?: number;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await this.client.from('runtime_billing_state').upsert(
      {
        user_id: payload.userId,
        scope_type: payload.scopeType,
        scope_id: payload.scopeId,
        payload: payload.state,
        schema_version: payload.schemaVersion ?? 1,
        version: payload.version ?? 1,
        updated_at: nowIso,
      },
      {
        onConflict: 'user_id,scope_type,scope_id',
      }
    );
    if (error) throw error;
  }

  async loadState(payload: {
    userId: string;
    scopeType: string;
    scopeId: string;
  }): Promise<RuntimeBillingStateSnapshot | null> {
    const { data, error } = await this.client
      .from('runtime_billing_state')
      .select('*')
      .eq('user_id', payload.userId)
      .eq('scope_type', payload.scopeType)
      .eq('scope_id', payload.scopeId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toSnapshot(data);
  }

  async listStatesByScope(payload: {
    scopeType: string;
    scopeId: string;
  }): Promise<RuntimeBillingStateSnapshot[]> {
    const { data, error } = await this.client
      .from('runtime_billing_state')
      .select('*')
      .eq('scope_type', payload.scopeType)
      .eq('scope_id', payload.scopeId);
    if (error) throw error;
    if (!Array.isArray(data)) return [];
    return data.map((row) => toSnapshot(row));
  }
}

export const runtimeBillingRepository = new RuntimeBillingRepository();
