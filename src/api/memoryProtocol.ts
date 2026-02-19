import {
  buildDeterministicEmbedding,
  toIsoTimestamp,
} from '@ashim/engine';
import { memoryManager } from '../engine/memory/memoryManager';
import { runtimeMemoryRepository } from '../data/repositories';
import { isSupabasePersistenceEnabled } from '../runtime/persistenceMode';
import type {
  ConsolidationAction,
  ConsolidationReport,
  MemoryNode,
  RetrievalSignalBreakdown,
} from '../engine/memory/types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const normalizeNamespace = (namespace: string): string => {
  return namespace.trim().toLowerCase();
};

const normalizeTags = (tags?: ReadonlyArray<string>): string[] => {
  if (!tags || tags.length === 0) return [];
  const normalized = tags
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
};

export interface MemoryProtocolEntry {
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
  createdAtIso: string;
  updatedAtIso: string;
  lastAccessedAtIso?: string;
  accessCount: number;
}

export interface MemoryProtocolRecallHit {
  entry: MemoryProtocolEntry;
  score: number;
  breakdown: RetrievalSignalBreakdown;
}

export interface MemoryProtocolRecallResult {
  query: string;
  generatedAtIso: string;
  formula: string;
  scannedMemoryCount: number;
  discardedWithoutEmbedding: number;
  hits: MemoryProtocolRecallHit[];
}

export interface MemoryProtocolConsolidationResult {
  report: ConsolidationReport;
  namespaces: string[];
  affectedEntries: number;
}

export interface MemoryNamespaceStats {
  appId: string;
  namespace: string;
  memoryCount: number;
  lastWriteAtIso?: string;
}

const workspaceKey = (payload: { userId: string; workspaceId: string }): string =>
  `${payload.userId}::${payload.workspaceId}`;

export class MemoryProtocol {
  private readonly entriesById = new Map<string, MemoryProtocolEntry>();
  private readonly indexByWorkspace = new Map<string, string[]>();
  private readonly remoteHydrationByWorkspace = new Map<string, Promise<void>>();

  private async ensureHydrated(payload: {
    userId: string;
    workspaceId: string;
  }): Promise<void> {
    if (!isSupabasePersistenceEnabled()) return;
    const key = workspaceKey(payload);
    const existing = this.remoteHydrationByWorkspace.get(key);
    if (existing) {
      await existing;
      return;
    }

    const hydration = runtimeMemoryRepository
      .listByWorkspace({
        userId: payload.userId,
        workspaceId: payload.workspaceId,
      })
      .then((rows) => {
        const knownIds = new Set<string>();
        const orderedIds: string[] = [];
        for (const row of rows) {
          knownIds.add(row.id);
          orderedIds.push(row.id);
          this.entriesById.set(row.id, {
            id: row.id,
            userId: row.userId,
            workspaceId: row.workspaceId,
            appId: row.appId,
            namespace: row.namespace,
            content: row.content,
            tags: [...row.tags],
            metadata: { ...row.metadata },
            emotionalValence: row.emotionalValence,
            decayFactor: row.decayFactor,
            embedding: [...row.embedding],
            createdAtIso: row.createdAt,
            updatedAtIso: row.updatedAt,
            accessCount: 1,
          });
        }
        if (orderedIds.length > 0) {
          this.indexByWorkspace.set(key, orderedIds);
        } else if (!this.indexByWorkspace.has(key)) {
          this.indexByWorkspace.set(key, []);
        }

        const staleIds = (this.indexByWorkspace.get(key) ?? []).filter((id) => !knownIds.has(id));
        for (const staleId of staleIds) {
          this.entriesById.delete(staleId);
        }
      })
      .catch(() => {
        // Keep in-memory state on remote hydration errors.
      });

    this.remoteHydrationByWorkspace.set(key, hydration);
    await hydration;
  }

  write(input: {
    userId: string;
    workspaceId: string;
    appId: string;
    namespace: string;
    content: string;
    tags?: ReadonlyArray<string>;
    metadata?: Record<string, unknown>;
    emotionalValence?: number;
    decayFactor?: number;
    nowIso?: string;
  }): MemoryProtocolEntry {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const content = input.content.trim();
    if (!content) {
      throw new Error('content is required.');
    }

    const entry: MemoryProtocolEntry = {
      id: makeId('memory-entry'),
      userId: input.userId,
      workspaceId: input.workspaceId,
      appId: input.appId.trim().toLowerCase(),
      namespace: normalizeNamespace(input.namespace),
      content,
      tags: normalizeTags(input.tags),
      metadata: { ...(input.metadata ?? {}) },
      emotionalValence: clamp(Number(input.emotionalValence ?? 0), -1, 1),
      decayFactor: clamp(Number(input.decayFactor ?? 0.5), 0, 1),
      embedding: buildDeterministicEmbedding(content),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      accessCount: 1,
    };

    this.entriesById.set(entry.id, entry);

    const key = workspaceKey(input);
    const ids = this.indexByWorkspace.get(key) ?? [];
    this.indexByWorkspace.set(key, [entry.id, ...ids]);

    if (isSupabasePersistenceEnabled()) {
      void runtimeMemoryRepository.upsertEntry({
        id: entry.id,
        userId: entry.userId,
        workspaceId: entry.workspaceId,
        appId: entry.appId,
        namespace: entry.namespace,
        content: entry.content,
        tags: [...entry.tags],
        metadata: { ...entry.metadata },
        emotionalValence: entry.emotionalValence,
        decayFactor: entry.decayFactor,
        embedding: [...entry.embedding],
        schemaVersion: 1,
        version: 1,
      });
    }

    return this.cloneEntry(entry);
  }

  async recall(input: {
    userId: string;
    workspaceId: string;
    query: string;
    namespaces?: ReadonlyArray<string>;
    topK?: number;
    nowIso?: string;
  }): Promise<MemoryProtocolRecallResult> {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const query = input.query.trim();
    if (!query) {
      throw new Error('query is required.');
    }

    await this.ensureHydrated({
      userId: input.userId,
      workspaceId: input.workspaceId,
    });

    const candidates = this.listForWorkspace({
      userId: input.userId,
      workspaceId: input.workspaceId,
      namespaces: input.namespaces,
    });

    const nodes = candidates.map((entry) => this.toMemoryNode(entry));
    const topK = Math.max(1, Math.min(30, Math.trunc(input.topK ?? 8)));
    const retrieval = await memoryManager.retrieveRelevant({
      query,
      memories: nodes,
      limit: topK,
      nowIso,
    });

    const seen = new Set<string>();
    for (const selected of retrieval.selected) {
      const record = this.entriesById.get(selected.memory.id);
      if (!record) continue;
      if (seen.has(record.id)) continue;
      seen.add(record.id);

      this.entriesById.set(record.id, {
        ...record,
        accessCount: record.accessCount + 1,
        lastAccessedAtIso: nowIso,
        updatedAtIso: nowIso,
      });

      if (isSupabasePersistenceEnabled()) {
        void runtimeMemoryRepository.upsertEntry({
          id: record.id,
          userId: record.userId,
          workspaceId: record.workspaceId,
          appId: record.appId,
          namespace: record.namespace,
          content: record.content,
          tags: [...record.tags],
          metadata: { ...record.metadata },
          emotionalValence: record.emotionalValence,
          decayFactor: record.decayFactor,
          embedding: [...record.embedding],
          schemaVersion: 1,
          version: 1,
        });
      }
    }

    return {
      query,
      generatedAtIso: nowIso,
      formula: retrieval.formula,
      scannedMemoryCount: candidates.length,
      discardedWithoutEmbedding: retrieval.discardedWithoutEmbedding,
      hits: retrieval.selected.map((selected) => ({
        entry: this.cloneEntry(this.entriesById.get(selected.memory.id) ?? this.fromNode(selected.memory)),
        score: selected.score,
        breakdown: { ...selected.breakdown },
      })),
    };
  }

  consolidate(input: {
    userId: string;
    workspaceId: string;
    namespaces?: ReadonlyArray<string>;
    dryRun?: boolean;
    nowIso?: string;
  }): MemoryProtocolConsolidationResult {
    const nowIso = input.nowIso ?? new Date().toISOString();
    if (isSupabasePersistenceEnabled()) {
      void this.ensureHydrated({
        userId: input.userId,
        workspaceId: input.workspaceId,
      });
    }

    const selected = this.listForWorkspace({
      userId: input.userId,
      workspaceId: input.workspaceId,
      namespaces: input.namespaces,
    });
    const nodes = selected.map((entry) => this.toMemoryNode(entry));

    const report = memoryManager.consolidate({
      memories: nodes,
      nowIso,
      dryRun: input.dryRun,
    });

    if (!input.dryRun) {
      const resultingById = new Map(report.resultingMemories.map((memory) => [memory.id, memory]));
      for (const entry of selected) {
        const updated = resultingById.get(entry.id);
        if (!updated) {
          this.removeEntry(entry.id);
          if (isSupabasePersistenceEnabled()) {
            void runtimeMemoryRepository.deleteByWorkspace({
              userId: entry.userId,
              workspaceId: entry.workspaceId,
              namespaces: [entry.namespace],
            });
          }
          continue;
        }

        this.entriesById.set(entry.id, {
          ...entry,
          emotionalValence: updated.emotionalValence,
          decayFactor: updated.decayFactor,
          accessCount: updated.accessCount,
          embedding: [...updated.embedding],
          metadata: { ...updated.metadata },
          updatedAtIso: nowIso,
        });

        if (isSupabasePersistenceEnabled()) {
          void runtimeMemoryRepository.upsertEntry({
            id: entry.id,
            userId: entry.userId,
            workspaceId: entry.workspaceId,
            appId: entry.appId,
            namespace: entry.namespace,
            content: entry.content,
            tags: [...(updated.metadata.tags as string[] | undefined ?? entry.tags)],
            metadata: { ...updated.metadata },
            emotionalValence: updated.emotionalValence,
            decayFactor: updated.decayFactor,
            embedding: [...updated.embedding],
            schemaVersion: 1,
            version: 1,
          });
        }
      }
    }

    return {
      report,
      namespaces: [...new Set(selected.map((entry) => entry.namespace))],
      affectedEntries: selected.length,
    };
  }

  listForWorkspace(input: {
    userId: string;
    workspaceId: string;
    namespaces?: ReadonlyArray<string>;
  }): MemoryProtocolEntry[] {
    if (isSupabasePersistenceEnabled()) {
      void this.ensureHydrated({
        userId: input.userId,
        workspaceId: input.workspaceId,
      });
    }

    const key = workspaceKey(input);
    const namespaceFilter = input.namespaces
      ? new Set(input.namespaces.map((namespace) => normalizeNamespace(namespace)))
      : null;

    const ids = this.indexByWorkspace.get(key) ?? [];
    const entries = ids
      .map((id) => this.entriesById.get(id))
      .filter((entry): entry is MemoryProtocolEntry => Boolean(entry))
      .filter((entry) => (namespaceFilter ? namespaceFilter.has(entry.namespace) : true));

    return entries
      .slice()
      .sort((left, right) => Date.parse(right.updatedAtIso) - Date.parse(left.updatedAtIso))
      .map((entry) => this.cloneEntry(entry));
  }

  listNamespaceStats(input: {
    userId: string;
    workspaceId: string;
  }): MemoryNamespaceStats[] {
    const entries = this.listForWorkspace(input);
    const statsByNamespace = new Map<string, MemoryNamespaceStats>();

    for (const entry of entries) {
      const key = `${entry.appId}::${entry.namespace}`;
      const current = statsByNamespace.get(key);
      if (!current) {
        statsByNamespace.set(key, {
          appId: entry.appId,
          namespace: entry.namespace,
          memoryCount: 1,
          lastWriteAtIso: entry.createdAtIso,
        });
        continue;
      }

      statsByNamespace.set(key, {
        ...current,
        memoryCount: current.memoryCount + 1,
        lastWriteAtIso:
          Date.parse(entry.createdAtIso) > Date.parse(current.lastWriteAtIso ?? new Date(0).toISOString())
            ? entry.createdAtIso
            : current.lastWriteAtIso,
      });
    }

    return Array.from(statsByNamespace.values()).sort((left, right) =>
      left.namespace.localeCompare(right.namespace)
    );
  }

  resetForTests(): void {
    this.entriesById.clear();
    this.indexByWorkspace.clear();
  }

  private toMemoryNode(entry: MemoryProtocolEntry): MemoryNode {
    return {
      id: entry.id,
      userId: entry.userId,
      type: 'semantic',
      content: entry.content,
      embedding: [...entry.embedding],
      timestampIso: toIsoTimestamp(entry.createdAtIso),
      emotionalValence: entry.emotionalValence,
      accessCount: entry.accessCount,
      decayFactor: entry.decayFactor,
      metadata: {
        ...entry.metadata,
        namespace: entry.namespace,
        appId: entry.appId,
        tags: [...entry.tags],
      },
      provenance: [],
    };
  }

  private fromNode(node: MemoryNode): MemoryProtocolEntry {
    const namespace =
      typeof node.metadata.namespace === 'string' && node.metadata.namespace.trim().length > 0
        ? normalizeNamespace(node.metadata.namespace)
        : 'app.unknown';

    return {
      id: node.id,
      userId: node.userId,
      workspaceId: '',
      appId:
        typeof node.metadata.appId === 'string' && node.metadata.appId.trim().length > 0
          ? node.metadata.appId
          : 'unknown',
      namespace,
      content: node.content,
      tags: Array.isArray(node.metadata.tags)
        ? node.metadata.tags.filter((entry): entry is string => typeof entry === 'string')
        : [],
      metadata: { ...node.metadata },
      emotionalValence: node.emotionalValence,
      decayFactor: node.decayFactor,
      embedding: [...node.embedding],
      createdAtIso: node.timestampIso,
      updatedAtIso: node.timestampIso,
      accessCount: node.accessCount,
    };
  }

  private removeEntry(id: string): void {
    const existing = this.entriesById.get(id);
    if (!existing) return;

    this.entriesById.delete(id);
    const key = workspaceKey(existing);
    const ids = this.indexByWorkspace.get(key) ?? [];
    this.indexByWorkspace.set(
      key,
      ids.filter((entryId) => entryId !== id)
    );
  }

  private cloneEntry(entry: MemoryProtocolEntry): MemoryProtocolEntry {
    return {
      ...entry,
      tags: [...entry.tags],
      metadata: { ...entry.metadata },
      embedding: [...entry.embedding],
    };
  }
}

export const memoryProtocol = new MemoryProtocol();

export const summarizeConsolidationActions = (
  actions: ReadonlyArray<ConsolidationAction>
): Record<ConsolidationAction['kind'], number> => {
  return actions.reduce(
    (accumulator, action) => {
      accumulator[action.kind] += 1;
      return accumulator;
    },
    {
      merge: 0,
      strengthen_emotional: 0,
      decay: 0,
    }
  );
};
