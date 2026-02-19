import type { Memory } from '../../../types';
import { consolidateMemories } from './consolidation';
import {
  DEFAULT_RETRIEVAL_WEIGHTS,
  buildDeterministicEmbedding,
  retrieveMemoriesWithScoring,
  toIsoTimestamp,
} from './retrieval';
import { readProvenanceFromMetadata, toProvenanceDebugLines } from './provenance';
import type { ConsolidationReport, MemoryNode, RetrievalResult, RetrievalWeights } from './types';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const toStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
};

export interface RawMemoryRecord extends Partial<Memory> {
  user_id?: string;
  created_at?: string | number | Date;
  decay_factor?: number;
  emotional_valence?: number;
  access_count?: number;
}

interface MemoryManagerDependencies {
  embedText: (text: string) => Promise<ReadonlyArray<number>>;
  nowIso: () => string;
}

const defaultDependencies: MemoryManagerDependencies = {
  embedText: async (text) => buildDeterministicEmbedding(text),
  nowIso: () => new Date().toISOString(),
};

export class MemoryManager {
  private readonly dependencies: MemoryManagerDependencies;

  constructor(partialDependencies: Partial<MemoryManagerDependencies> = {}) {
    this.dependencies = {
      ...defaultDependencies,
      ...partialDependencies,
    };
  }

  normalizeRecord(record: RawMemoryRecord, fallbackUserId = 'unknown-user'): MemoryNode {
    const timestampIso = toIsoTimestamp(record.timestamp ?? record.created_at ?? this.dependencies.nowIso());
    const metadata = (record.metadata ?? {}) as Record<string, unknown>;

    const decay = clamp(
      Number(record.decay_factor ?? record.decayFactor ?? 0.5),
      0,
      1
    );
    const emotional = clamp(
      Number(record.emotional_valence ?? record.emotionalValence ?? 0),
      -1,
      1
    );

    const accessCount = Math.max(
      1,
      Number.isFinite(record.access_count)
        ? Number(record.access_count)
        : Number.isFinite(metadata.accessCount)
          ? Number(metadata.accessCount)
          : 1
    );

    return {
      id: String(record.id ?? `memory-${Math.random().toString(16).slice(2, 8)}`),
      userId: String(record.user_id ?? fallbackUserId),
      type: (record.type ?? 'semantic') as MemoryNode['type'],
      content: String(record.content ?? ''),
      embedding: Array.isArray(record.embedding) ? record.embedding : [],
      timestampIso,
      emotionalValence: emotional,
      accessCount,
      decayFactor: decay,
      metadata,
      provenance: readProvenanceFromMetadata(String(record.id ?? ''), metadata),
    };
  }

  async retrieveRelevant(params: {
    query: string;
    memories: ReadonlyArray<MemoryNode>;
    limit?: number;
    queryEmbedding?: ReadonlyArray<number>;
    nowIso?: string;
    weights?: RetrievalWeights;
  }): Promise<RetrievalResult> {
    const nowIso = params.nowIso ?? this.dependencies.nowIso();
    const queryEmbedding = params.queryEmbedding ?? (await this.dependencies.embedText(params.query));
    const weights = params.weights ?? DEFAULT_RETRIEVAL_WEIGHTS;

    return retrieveMemoriesWithScoring({
      candidates: params.memories,
      queryEmbedding,
      nowIso,
      limit: params.limit,
      weights,
    });
  }

  consolidate(params: {
    memories: ReadonlyArray<MemoryNode>;
    nowIso?: string;
    dryRun?: boolean;
    mergeSimilarityThreshold?: number;
    decayAfterDays?: number;
    emotionalStrengthenThreshold?: number;
  }): ConsolidationReport {
    return consolidateMemories({
      ...params,
      nowIso: params.nowIso ?? this.dependencies.nowIso(),
    });
  }

  withProvenance(memory: MemoryNode, messageRefs: Array<{ messageId: string; threadId: string }>): MemoryNode {
    const base = [...memory.provenance];
    const createdAtIso = this.dependencies.nowIso();
    for (const ref of messageRefs) {
      base.push({
        memoryId: memory.id,
        messageId: ref.messageId,
        threadId: ref.threadId,
        role: 'unknown',
        excerpt: '',
        createdAtIso,
      });
    }

    return {
      ...memory,
      provenance: base,
      metadata: {
        ...memory.metadata,
        source_message_ids: toStringList(messageRefs.map((entry) => entry.messageId)),
      },
    };
  }

  debugProvenance(memories: ReadonlyArray<Pick<MemoryNode, 'id' | 'content' | 'provenance'>>): string[] {
    return toProvenanceDebugLines(memories);
  }
}

export const memoryManager = new MemoryManager();

