import { cosineSimilarity, isoToUnixMs } from './retrieval';
import type {
  ConsolidationAction,
  ConsolidationMergePlan,
  ConsolidationReport,
  MemoryNode,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const mergeEmbeddings = (
  primary: ReadonlyArray<number>,
  secondary: ReadonlyArray<number>
): number[] => {
  const size = Math.max(primary.length, secondary.length);
  const merged = new Array<number>(size).fill(0);

  for (let index = 0; index < size; index += 1) {
    const left = primary[index] ?? 0;
    const right = secondary[index] ?? 0;
    merged[index] = (left + right) / 2;
  }

  return merged;
};

const dedupeProvenance = (links: MemoryNode['provenance']): MemoryNode['provenance'] => {
  const seen = new Set<string>();
  const unique = [];

  for (const link of links) {
    const key = `${link.messageId}:${link.threadId}:${link.createdAtIso}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(link);
  }

  return unique;
};

const cloneNode = (node: MemoryNode): MemoryNode => {
  return {
    ...node,
    embedding: [...node.embedding],
    metadata: { ...node.metadata },
    provenance: [...node.provenance],
  };
};

const ageInDays = (timestampIso: string, nowIso: string): number => {
  return Math.max(0, (isoToUnixMs(nowIso) - isoToUnixMs(timestampIso)) / DAY_MS);
};

export const consolidateMemories = (params: {
  memories: ReadonlyArray<MemoryNode>;
  nowIso?: string;
  dryRun?: boolean;
  mergeSimilarityThreshold?: number;
  decayAfterDays?: number;
  emotionalStrengthenThreshold?: number;
}): ConsolidationReport => {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const dryRun = params.dryRun === true;
  const mergeSimilarityThreshold = params.mergeSimilarityThreshold ?? 0.9;
  const decayAfterDays = params.decayAfterDays ?? 30;
  const emotionalStrengthenThreshold = params.emotionalStrengthenThreshold ?? 0.75;

  const working = params.memories.map(cloneNode);
  const consumed = new Set<string>();
  const mergePlans: ConsolidationMergePlan[] = [];
  const actions: ConsolidationAction[] = [];

  for (let source = 0; source < working.length; source += 1) {
    const primary = working[source];
    if (consumed.has(primary.id)) continue;

    const mergedIds: string[] = [];
    let strongestSimilarity = 0;

    for (let target = source + 1; target < working.length; target += 1) {
      const candidate = working[target];
      if (consumed.has(candidate.id)) continue;
      if (candidate.type !== primary.type) continue;

      const similarity = cosineSimilarity(primary.embedding, candidate.embedding);
      if (similarity < mergeSimilarityThreshold) continue;

      mergedIds.push(candidate.id);
      strongestSimilarity = Math.max(strongestSimilarity, similarity);
      consumed.add(candidate.id);

      primary.embedding = mergeEmbeddings(primary.embedding, candidate.embedding);
      primary.accessCount += candidate.accessCount;
      primary.decayFactor = clamp(Math.max(primary.decayFactor, candidate.decayFactor), 0, 1);
      primary.emotionalValence =
        (primary.emotionalValence + candidate.emotionalValence) / 2;
      primary.provenance = dedupeProvenance([...primary.provenance, ...candidate.provenance]);
      primary.metadata = {
        ...primary.metadata,
        mergedFrom: [...(Array.isArray(primary.metadata.mergedFrom) ? (primary.metadata.mergedFrom as string[]) : []), candidate.id],
      };
    }

    if (mergedIds.length > 0) {
      mergePlans.push({
        primaryId: primary.id,
        mergedIds,
        similarity: Number(strongestSimilarity.toFixed(4)),
      });
      actions.push({
        kind: 'merge',
        memoryIds: [primary.id, ...mergedIds],
        reason: `similarity >= ${mergeSimilarityThreshold}`,
      });
    }
  }

  const strengthenedIds: string[] = [];
  const decayedIds: string[] = [];

  const remaining = working.filter((memory) => !consumed.has(memory.id));

  for (const memory of remaining) {
    const emotionalMagnitude = Math.abs(memory.emotionalValence);
    if (emotionalMagnitude >= emotionalStrengthenThreshold) {
      memory.decayFactor = clamp(memory.decayFactor + 0.08, 0, 1);
      strengthenedIds.push(memory.id);
      actions.push({
        kind: 'strengthen_emotional',
        memoryIds: [memory.id],
        reason: `|emotional_valence| >= ${emotionalStrengthenThreshold}`,
      });
    }

    const memoryAgeDays = ageInDays(memory.timestampIso, nowIso);
    if (memoryAgeDays >= decayAfterDays && memory.accessCount <= 1) {
      memory.decayFactor = clamp(memory.decayFactor - 0.12, 0, 1);
      decayedIds.push(memory.id);
      actions.push({
        kind: 'decay',
        memoryIds: [memory.id],
        reason: `age >= ${decayAfterDays}d and access_count <= 1`,
      });
    }
  }

  return {
    dryRun,
    mergePlans,
    strengthenedIds,
    decayedIds,
    actions,
    resultingMemories: remaining,
    summary: {
      totalInput: params.memories.length,
      totalOutput: remaining.length,
      mergedCount: mergePlans.reduce((sum, entry) => sum + entry.mergedIds.length, 0),
    },
  };
};

