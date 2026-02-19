import { defaultSupabaseClient, SupabaseLike } from './base';

const toRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
};

const toNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry));
};

const toNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

export interface RuntimeMemoryEntry {
  id: string;
  userId: string;
  workspaceId: string;
  appId: string;
  namespace: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  emotionalValence: number;
  decayFactor: number;
  embedding: number[];
  schemaVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const toMemoryEntry = (row: unknown): RuntimeMemoryEntry => {
  const source = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    id: String(source.id ?? ''),
    userId: String(source.user_id ?? ''),
    workspaceId: String(source.workspace_id ?? ''),
    appId: String(source.app_id ?? ''),
    namespace: String(source.namespace ?? ''),
    content: String(source.content ?? ''),
    tags: toStringArray(source.tags),
    metadata: toRecord(source.metadata),
    emotionalValence: toNumber(source.emotional_valence, 0),
    decayFactor: toNumber(source.decay_factor, 0.5),
    embedding: toNumberArray(source.embedding),
    schemaVersion: toNumber(source.schema_version, 1),
    version: toNumber(source.version, 1),
    createdAt: String(source.created_at ?? ''),
    updatedAt: String(source.updated_at ?? ''),
  };
};

export class RuntimeMemoryRepository {
  constructor(private readonly client: SupabaseLike = defaultSupabaseClient) {}

  async upsertEntry(payload: {
    id: string;
    userId: string;
    workspaceId: string;
    appId: string;
    namespace: string;
    content: string;
    tags: string[];
    metadata: Record<string, unknown>;
    emotionalValence: number;
    decayFactor: number;
    embedding: number[];
    schemaVersion?: number;
    version?: number;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await this.client.from('runtime_memory_entries').upsert({
      id: payload.id,
      user_id: payload.userId,
      workspace_id: payload.workspaceId,
      app_id: payload.appId,
      namespace: payload.namespace,
      content: payload.content,
      tags: payload.tags,
      metadata: payload.metadata,
      emotional_valence: payload.emotionalValence,
      decay_factor: payload.decayFactor,
      embedding: payload.embedding,
      schema_version: payload.schemaVersion ?? 1,
      version: payload.version ?? 1,
      updated_at: nowIso,
    });
    if (error) throw error;
  }

  async listByWorkspace(payload: {
    userId: string;
    workspaceId: string;
    namespaces?: string[];
  }): Promise<RuntimeMemoryEntry[]> {
    let query = this.client
      .from('runtime_memory_entries')
      .select('*')
      .eq('user_id', payload.userId)
      .eq('workspace_id', payload.workspaceId)
      .order('updated_at', { ascending: false });

    if (payload.namespaces && payload.namespaces.length > 0) {
      query = query.or(
        payload.namespaces
          .map((namespace) => `namespace.eq.${namespace}`)
          .join(',')
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(toMemoryEntry);
  }

  async deleteByWorkspace(payload: {
    userId: string;
    workspaceId: string;
    namespaces?: string[];
  }): Promise<void> {
    let query = this.client
      .from('runtime_memory_entries')
      .delete()
      .eq('user_id', payload.userId)
      .eq('workspace_id', payload.workspaceId);

    if (payload.namespaces && payload.namespaces.length > 0) {
      query = query.or(
        payload.namespaces
          .map((namespace) => `namespace.eq.${namespace}`)
          .join(',')
      );
    }

    const { error } = await query;
    if (error) throw error;
  }
}

export const runtimeMemoryRepository = new RuntimeMemoryRepository();
