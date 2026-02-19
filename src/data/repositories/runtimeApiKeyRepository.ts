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

export interface RuntimeApiKeyStateSnapshot {
  id: string;
  userId: string;
  keyId: string;
  payload: Record<string, unknown>;
  schemaVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const toSnapshot = (row: unknown): RuntimeApiKeyStateSnapshot => {
  const source = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    id: String(source.id ?? ''),
    userId: String(source.user_id ?? ''),
    keyId: String(source.key_id ?? ''),
    payload: toRecord(source.payload),
    schemaVersion: toNumber(source.schema_version, 1),
    version: toNumber(source.version, 1),
    createdAt: String(source.created_at ?? ''),
    updatedAt: String(source.updated_at ?? ''),
  };
};

export class RuntimeApiKeyRepository {
  constructor(private readonly client: SupabaseLike = defaultSupabaseClient) {}

  async saveKeyState(payload: {
    userId: string;
    keyId: string;
    state: Record<string, unknown>;
    schemaVersion?: number;
    version?: number;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await this.client.from('runtime_api_keys').upsert(
      {
        user_id: payload.userId,
        key_id: payload.keyId,
        payload: payload.state,
        schema_version: payload.schemaVersion ?? 1,
        version: payload.version ?? 1,
        updated_at: nowIso,
      },
      {
        onConflict: 'user_id,key_id',
      }
    );
    if (error) throw error;
  }

  async loadKeyState(payload: {
    userId: string;
    keyId: string;
  }): Promise<RuntimeApiKeyStateSnapshot | null> {
    const { data, error } = await this.client
      .from('runtime_api_keys')
      .select('*')
      .eq('user_id', payload.userId)
      .eq('key_id', payload.keyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toSnapshot(data);
  }

  async listByUser(userId: string): Promise<RuntimeApiKeyStateSnapshot[]> {
    const { data, error } = await this.client
      .from('runtime_api_keys')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    if (!Array.isArray(data)) return [];
    return data.map((row) => toSnapshot(row));
  }

  async listByKeyId(keyId: string): Promise<RuntimeApiKeyStateSnapshot[]> {
    const { data, error } = await this.client
      .from('runtime_api_keys')
      .select('*')
      .eq('key_id', keyId);
    if (error) throw error;
    if (!Array.isArray(data)) return [];
    return data.map((row) => toSnapshot(row));
  }
}

export const runtimeApiKeyRepository = new RuntimeApiKeyRepository();
