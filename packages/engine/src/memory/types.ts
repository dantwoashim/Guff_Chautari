export type MemoryKind = 'episodic' | 'semantic' | 'emotional' | 'procedural';

export interface MemoryProvenanceLink {
  memoryId: string;
  messageId: string;
  threadId: string;
  role: string;
  excerpt: string;
  createdAtIso: string;
}

export interface MemoryNode {
  id: string;
  userId: string;
  type: MemoryKind;
  content: string;
  embedding: ReadonlyArray<number>;
  timestampIso: string;
  emotionalValence: number;
  accessCount: number;
  decayFactor: number;
  metadata: Record<string, unknown>;
  provenance: ReadonlyArray<MemoryProvenanceLink>;
}

export interface RetrievalWeights {
  semantic: number;
  recency: number;
  emotional: number;
  frequency: number;
}

export interface RetrievalSignalBreakdown {
  semantic: number;
  recency: number;
  emotional: number;
  frequency: number;
}

export interface RetrievalScoredMemory {
  memory: MemoryNode;
  score: number;
  breakdown: RetrievalSignalBreakdown;
}

export interface RetrievalResult {
  selected: RetrievalScoredMemory[];
  weights: RetrievalWeights;
  formula: string;
  discardedWithoutEmbedding: number;
}

export interface ConsolidationMergePlan {
  primaryId: string;
  mergedIds: string[];
  similarity: number;
}

export interface ConsolidationAction {
  kind: 'merge' | 'strengthen_emotional' | 'decay';
  memoryIds: string[];
  reason: string;
}

export interface ConsolidationReport {
  dryRun: boolean;
  mergePlans: ConsolidationMergePlan[];
  strengthenedIds: string[];
  decayedIds: string[];
  actions: ConsolidationAction[];
  resultingMemories: MemoryNode[];
  summary: {
    totalInput: number;
    totalOutput: number;
    mergedCount: number;
  };
}

