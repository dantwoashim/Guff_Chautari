export type KnowledgeSourceType = 'note' | 'file' | 'url';

export interface SourceDocument {
  id: string;
  userId: string;
  type: KnowledgeSourceType;
  title: string;
  uri?: string;
  mimeType?: string;
  createdAtIso: string;
  contentHash: string;
  text: string;
  metadata?: {
    sizeBytes?: number;
    tags?: string[];
  };
}

export interface KnowledgeNode {
  id: string;
  userId: string;
  sourceId: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
  importance: number;
  createdAtIso: string;
}

export interface KnowledgeEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  type: 'source' | 'semantic' | 'temporal';
  weight: number;
}

export interface KnowledgeQuery {
  userId: string;
  query: string;
  topK?: number;
  nowIso?: string;
}

export interface KnowledgeRetrievalHit {
  node: KnowledgeNode;
  source: SourceDocument;
  score: number;
  semanticScore: number;
  recencyScore: number;
  importanceScore: number;
}

export interface KnowledgeRetrievalResult {
  query: string;
  hits: KnowledgeRetrievalHit[];
  formula: string;
  generatedAtIso: string;
}

export interface KnowledgeCitation {
  sourceId: string;
  sourceTitle: string;
  sourceType: KnowledgeSourceType;
  nodeId: string;
  chunkIndex: number;
  snippet: string;
  marker: string;
}

export interface KnowledgeSynthesisResult {
  answer: string;
  citations: KnowledgeCitation[];
  generatedAtIso: string;
}

export interface KnowledgeTimelineItem {
  sourceId: string;
  title: string;
  type: KnowledgeSourceType;
  createdAtIso: string;
  preview: string;
  nodeCount: number;
}

export interface KnowledgeGraphState {
  sources: SourceDocument[];
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  updatedAtIso: string;
}

export interface KnowledgeStoreAdapter {
  load: (userId: string) => KnowledgeGraphState;
  save: (userId: string, state: KnowledgeGraphState) => void;
}

export interface IngestKnowledgeInput {
  userId: string;
  type: KnowledgeSourceType;
  title: string;
  text: string;
  uri?: string;
  mimeType?: string;
  metadata?: SourceDocument['metadata'];
  nowIso?: string;
}

export interface IngestKnowledgeResult {
  source: SourceDocument;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}
