import { Memory } from '../../../types';
import { defaultSupabaseClient, SupabaseLike } from './base';

const toTimestamp = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.round(value) : Math.round(value * 1000);
  }

  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) {
      const numeric = Number(value);
      return numeric > 10_000_000_000 ? Math.round(numeric) : Math.round(numeric * 1000);
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return Date.now();
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
};

const toEmbedding = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
    .slice();
};

const toMetadata = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const toMemory = (row: unknown): Memory => {
  const source = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;

  return {
    id: String(source.id ?? ''),
    content: String(source.content ?? ''),
    type: (source.type ?? 'semantic') as Memory['type'],
    embedding: toEmbedding(source.embedding),
    timestamp: toTimestamp(source.timestamp ?? source.created_at),
    decayFactor: Number(source.decay_factor ?? source.decayFactor ?? 0.5),
    connections: toStringArray(source.connections),
    emotionalValence: Number(source.emotional_valence ?? source.emotionalValence ?? 0),
    metadata: toMetadata(source.metadata),
  };
};

export class MemoryRepository {
  constructor(private readonly client: SupabaseLike = defaultSupabaseClient) {}

  async listRecentByUser(userId: string, limit = 20): Promise<Memory[]> {
    const { data, error } = await this.client
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    return rows.map(toMemory);
  }

  async upsertMemory(payload: Record<string, unknown>): Promise<void> {
    const { error } = await this.client.from('memories').upsert(payload);
    if (error) throw error;
  }

  async updateDecay(id: string, decayFactor: number): Promise<void> {
    const { error } = await this.client.from('memories').update({ decay_factor: decayFactor }).eq('id', id);
    if (error) throw error;
  }

  async deleteMemory(id: string): Promise<void> {
    const { error } = await this.client.from('memories').delete().eq('id', id);
    if (error) throw error;
  }
}

export const memoryRepository = new MemoryRepository();
