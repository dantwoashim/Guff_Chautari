import { buildDeterministicEmbedding, cosineSimilarity } from '@ashim/engine';
import { KnowledgeGraphStore, knowledgeGraphStore } from './store';
import type {
  KnowledgeQuery,
  KnowledgeRetrievalHit,
  KnowledgeRetrievalResult,
  SourceDocument,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const computeSemantic = (queryEmbedding: ReadonlyArray<number>, nodeEmbedding: ReadonlyArray<number>): number => {
  return clamp((cosineSimilarity(queryEmbedding, nodeEmbedding) + 1) / 2, 0, 1);
};

const tokenize = (value: string): string[] => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\\s]/gi, ' ')
    .split(/\\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
};

const computeLexical = (query: string, nodeText: string): number => {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return 0;

  const nodeTokenSet = new Set(tokenize(nodeText));
  const overlapCount = queryTokens.filter((token) => nodeTokenSet.has(token)).length;
  const overlapRatio = overlapCount / queryTokens.length;
  const phraseBoost = nodeText.toLowerCase().includes(query.toLowerCase()) ? 0.2 : 0;
  return clamp(overlapRatio + phraseBoost, 0, 1);
};

const computeRecency = (nodeCreatedAtIso: string, nowIso: string): number => {
  const ageMs = Math.max(0, toMs(nowIso) - toMs(nodeCreatedAtIso));
  const ageDays = ageMs / DAY_MS;
  return clamp(1 / (1 + ageDays / 21), 0, 1);
};

const computeTotal = (payload: {
  semantic: number;
  recency: number;
  importance: number;
  lexical: number;
}): number => {
  const weighted =
    payload.semantic * 0.45 +
    payload.recency * 0.2 +
    payload.importance * 0.2 +
    payload.lexical * 0.15;
  return Number(clamp(weighted, 0, 1).toFixed(4));
};

const buildSourceIndex = (sources: ReadonlyArray<SourceDocument>): Map<string, SourceDocument> => {
  return new Map(sources.map((source) => [source.id, source]));
};

export const retrieveKnowledge = (
  query: KnowledgeQuery,
  store: KnowledgeGraphStore = knowledgeGraphStore
): KnowledgeRetrievalResult => {
  const state = store.load(query.userId);
  const sourceById = buildSourceIndex(state.sources);
  const queryEmbedding = buildDeterministicEmbedding(query.query);
  const nowIso = query.nowIso ?? new Date().toISOString();
  const topK = Math.max(1, query.topK ?? 6);

  const scoredHits: KnowledgeRetrievalHit[] = state.nodes
    .map((node) => {
      const source = sourceById.get(node.sourceId);
      if (!source) return null;

      const semanticScore = computeSemantic(queryEmbedding, node.embedding);
      const recencyScore = computeRecency(node.createdAtIso, nowIso);
      const importanceScore = clamp(node.importance, 0, 1);
      const lexicalScore = computeLexical(query.query, node.text);
      const score = computeTotal({
        semantic: semanticScore,
        recency: recencyScore,
        importance: importanceScore,
        lexical: lexicalScore,
      });

      return {
        node,
        source,
        score,
        semanticScore: Number(semanticScore.toFixed(4)),
        recencyScore: Number(recencyScore.toFixed(4)),
        importanceScore: Number(importanceScore.toFixed(4)),
      };
    })
    .filter((entry): entry is KnowledgeRetrievalHit => entry !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);

  return {
    query: query.query,
    hits: scoredHits,
    formula: 'semantic(0.45) + recency(0.20) + importance(0.20) + lexical(0.15)',
    generatedAtIso: nowIso,
  };
};

export const searchKnowledgeSources = (
  payload: {
    userId: string;
    term?: string;
    type?: SourceDocument['type'] | 'all';
  },
  store: KnowledgeGraphStore = knowledgeGraphStore
): SourceDocument[] => {
  const state = store.load(payload.userId);
  const lowered = payload.term?.toLowerCase().trim() || '';
  const typeFilter = payload.type && payload.type !== 'all' ? payload.type : null;

  return state.sources
    .filter((source) => (typeFilter ? source.type === typeFilter : true))
    .filter((source) => {
      if (!lowered) return true;
      return (
        source.title.toLowerCase().includes(lowered) ||
        source.text.toLowerCase().includes(lowered) ||
        source.uri?.toLowerCase().includes(lowered)
      );
    })
    .sort((left, right) => toMs(right.createdAtIso) - toMs(left.createdAtIso));
};
