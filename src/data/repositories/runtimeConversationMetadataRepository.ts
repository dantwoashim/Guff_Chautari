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

export interface RuntimeConversationMetadataSnapshot {
  id: string;
  userId: string;
  workspaceId: string;
  conversationId: string;
  personaId?: string;
  personaName?: string;
  archivedAtIso?: string;
  payload: Record<string, unknown>;
  schemaVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const toSnapshot = (row: unknown): RuntimeConversationMetadataSnapshot => {
  const source = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const personaId = source.persona_id;
  const personaName = source.persona_name;
  const archivedAtIso = source.archived_at_iso;
  return {
    id: String(source.id ?? ''),
    userId: String(source.user_id ?? ''),
    workspaceId: String(source.workspace_id ?? ''),
    conversationId: String(source.conversation_id ?? ''),
    personaId: typeof personaId === 'string' && personaId.length > 0 ? personaId : undefined,
    personaName:
      typeof personaName === 'string' && personaName.length > 0 ? personaName : undefined,
    archivedAtIso:
      typeof archivedAtIso === 'string' && archivedAtIso.length > 0 ? archivedAtIso : undefined,
    payload: toRecord(source.payload),
    schemaVersion: toNumber(source.schema_version, 1),
    version: toNumber(source.version, 1),
    createdAt: String(source.created_at ?? ''),
    updatedAt: String(source.updated_at ?? ''),
  };
};

export class RuntimeConversationMetadataRepository {
  constructor(private readonly client: SupabaseLike = defaultSupabaseClient) {}

  async upsertConversationMetadata(payload: {
    userId: string;
    workspaceId: string;
    conversationId: string;
    personaId?: string;
    personaName?: string;
    archivedAtIso?: string;
    metadata?: Record<string, unknown>;
    schemaVersion?: number;
    version?: number;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await this.client.from('runtime_conversation_metadata').upsert({
      user_id: payload.userId,
      workspace_id: payload.workspaceId,
      conversation_id: payload.conversationId,
      persona_id: payload.personaId ?? null,
      persona_name: payload.personaName ?? null,
      archived_at_iso: payload.archivedAtIso ?? null,
      payload: payload.metadata ?? {},
      schema_version: payload.schemaVersion ?? 1,
      version: payload.version ?? 1,
      updated_at: nowIso,
    });
    if (error) throw error;
  }

  async getConversationMetadata(payload: {
    userId: string;
    workspaceId: string;
    conversationId: string;
  }): Promise<RuntimeConversationMetadataSnapshot | null> {
    const { data, error } = await this.client
      .from('runtime_conversation_metadata')
      .select('*')
      .eq('user_id', payload.userId)
      .eq('workspace_id', payload.workspaceId)
      .eq('conversation_id', payload.conversationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toSnapshot(data);
  }

  async listConversationMetadata(payload: {
    userId: string;
    workspaceId: string;
  }): Promise<RuntimeConversationMetadataSnapshot[]> {
    const { data, error } = await this.client
      .from('runtime_conversation_metadata')
      .select('*')
      .eq('user_id', payload.userId)
      .eq('workspace_id', payload.workspaceId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(toSnapshot);
  }

  async archiveConversation(payload: {
    userId: string;
    workspaceId: string;
    conversationId: string;
    archivedAtIso: string;
  }): Promise<void> {
    const { error } = await this.client
      .from('runtime_conversation_metadata')
      .update({ archived_at_iso: payload.archivedAtIso, updated_at: payload.archivedAtIso })
      .eq('user_id', payload.userId)
      .eq('workspace_id', payload.workspaceId)
      .eq('conversation_id', payload.conversationId);
    if (error) throw error;
  }
}

export const runtimeConversationMetadataRepository =
  new RuntimeConversationMetadataRepository();
