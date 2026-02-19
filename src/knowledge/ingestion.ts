import { buildDeterministicEmbedding } from '@ashim/engine';
import { KnowledgeGraphStore, knowledgeGraphStore } from './store';
import type {
  IngestKnowledgeInput,
  IngestKnowledgeResult,
  KnowledgeEdge,
  KnowledgeNode,
  SourceDocument,
} from './types';

const cleanWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const splitIntoChunks = (
  text: string,
  options: {
    wordsPerChunk?: number;
    overlapWords?: number;
  } = {}
): string[] => {
  const wordsPerChunk = Math.max(40, options.wordsPerChunk ?? 120);
  const overlapWords = Math.max(0, Math.min(wordsPerChunk - 1, options.overlapWords ?? 24));
  const words = cleanWhitespace(text)
    .split(' ')
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  if (words.length === 0) return [];

  const chunks: string[] = [];
  let index = 0;
  while (index < words.length) {
    const chunkWords = words.slice(index, index + wordsPerChunk);
    chunks.push(chunkWords.join(' '));
    if (index + wordsPerChunk >= words.length) break;
    index += wordsPerChunk - overlapWords;
  }
  return chunks;
};

const stableHash = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(16);
};

const scoreImportance = (chunkText: string): number => {
  const lowered = chunkText.toLowerCase();
  const importantTerms = ['must', 'critical', 'decision', 'deadline', 'risk', 'launch', 'priority'];
  const termHits = importantTerms.filter((term) => lowered.includes(term)).length;
  const sentenceCount = chunkText.split(/(?<=[.!?])\s+/).filter((line) => line.trim().length > 0).length;
  const base = 0.35 + Math.min(0.4, termHits * 0.09) + Math.min(0.2, sentenceCount / 20);
  return Number(Math.max(0, Math.min(1, base)).toFixed(4));
};

const buildSourceDocument = (input: IngestKnowledgeInput): SourceDocument => {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const normalizedTitle = cleanWhitespace(input.title) || 'Untitled Source';
  const contentHash = stableHash(`${input.type}:${normalizedTitle}:${input.text}`);

  return {
    id: `source-${input.type}-${contentHash}`,
    userId: input.userId,
    type: input.type,
    title: normalizedTitle,
    uri: input.uri,
    mimeType: input.mimeType,
    createdAtIso: nowIso,
    contentHash,
    text: cleanWhitespace(input.text),
    metadata: input.metadata,
  };
};

const buildNodes = (source: SourceDocument): KnowledgeNode[] => {
  const chunks = splitIntoChunks(source.text);
  if (chunks.length === 0) return [];

  return chunks.map((chunk, index) => ({
    id: `node-${source.id}-${index}`,
    userId: source.userId,
    sourceId: source.id,
    chunkIndex: index,
    text: chunk,
    embedding: buildDeterministicEmbedding(chunk),
    importance: scoreImportance(chunk),
    createdAtIso: source.createdAtIso,
  }));
};

const buildEdges = (sourceId: string, nodes: ReadonlyArray<KnowledgeNode>): KnowledgeEdge[] => {
  const edges: KnowledgeEdge[] = [];

  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push({
      id: `edge-source-${sourceId}-${index}`,
      fromNodeId: nodes[index].id,
      toNodeId: nodes[index + 1].id,
      type: 'source',
      weight: 1,
    });
  }

  return edges;
};

const upsertById = <T extends { id: string }>(existing: ReadonlyArray<T>, incoming: ReadonlyArray<T>): T[] => {
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return [...map.values()];
};

export const ingestKnowledge = (
  input: IngestKnowledgeInput,
  store: KnowledgeGraphStore = knowledgeGraphStore
): IngestKnowledgeResult => {
  const source = buildSourceDocument(input);
  const nodes = buildNodes(source);
  const edges = buildEdges(source.id, nodes);

  store.update(input.userId, (state) => {
    const nextSources = upsertById(state.sources, [source]);
    const nextNodes = upsertById(
      state.nodes.filter((node) => node.sourceId !== source.id),
      nodes
    );
    const nextEdges = upsertById(
      state.edges.filter((edge) => !edge.id.startsWith(`edge-source-${source.id}-`)),
      edges
    );

    return {
      ...state,
      sources: nextSources,
      nodes: nextNodes,
      edges: nextEdges,
    };
  });

  return { source, nodes, edges };
};

export const ingestKnowledgeNote = (
  input: {
    userId: string;
    title: string;
    text: string;
    nowIso?: string;
    tags?: string[];
  },
  store: KnowledgeGraphStore = knowledgeGraphStore
): IngestKnowledgeResult => {
  return ingestKnowledge(
    {
      userId: input.userId,
      type: 'note',
      title: input.title,
      text: input.text,
      nowIso: input.nowIso,
      metadata: {
        tags: input.tags,
      },
    },
    store
  );
};

export const ingestKnowledgeFile = (
  input: {
    userId: string;
    title: string;
    text: string;
    mimeType?: string;
    sizeBytes?: number;
    nowIso?: string;
  },
  store: KnowledgeGraphStore = knowledgeGraphStore
): IngestKnowledgeResult => {
  return ingestKnowledge(
    {
      userId: input.userId,
      type: 'file',
      title: input.title,
      text: input.text,
      mimeType: input.mimeType,
      nowIso: input.nowIso,
      metadata: {
        sizeBytes: input.sizeBytes,
      },
    },
    store
  );
};

export const ingestKnowledgeUrl = (
  input: {
    userId: string;
    title: string;
    url: string;
    text: string;
    nowIso?: string;
  },
  store: KnowledgeGraphStore = knowledgeGraphStore
): IngestKnowledgeResult => {
  return ingestKnowledge(
    {
      userId: input.userId,
      type: 'url',
      title: input.title,
      uri: input.url,
      text: input.text,
      nowIso: input.nowIso,
    },
    store
  );
};

export const extractTextFromHtml = (html: string): string => {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  const text = withoutScripts
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return text;
};

export const extractTitleFromHtml = (html: string): string | null => {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) return null;
  const normalized = cleanWhitespace(
    titleMatch[1]
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  );
  return normalized.length > 0 ? normalized : null;
};
