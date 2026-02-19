import type {
  MemoryNode,
  RetrievalResult,
  RetrievalScoredMemory,
  RetrievalSignalBreakdown,
  RetrievalWeights,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EMBEDDING_DIMENSIONS = 256;

export const DEFAULT_RETRIEVAL_WEIGHTS: RetrievalWeights = {
  semantic: 0.4,
  recency: 0.3,
  emotional: 0.2,
  frequency: 0.1,
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const normalizeFinite = (value: number): number => {
  return Number.isFinite(value) ? value : 0;
};

const epochToMs = (value: number): number => {
  if (!Number.isFinite(value)) {
    return Date.now();
  }

  if (value < 10_000_000_000) {
    return Math.round(value * 1000);
  }

  return Math.round(value);
};

export const toIsoTimestamp = (
  input: string | number | Date | null | undefined,
  fallbackIso = new Date().toISOString()
): string => {
  if (input instanceof Date) {
    return new Date(input.getTime()).toISOString();
  }

  if (typeof input === 'number') {
    return new Date(epochToMs(input)).toISOString();
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return fallbackIso;

    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      return new Date(epochToMs(numeric)).toISOString();
    }

    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return fallbackIso;
};

export const isoToUnixMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return Date.now();
  }
  return parsed;
};

export const hasUsableEmbedding = (embedding: ReadonlyArray<number>): boolean => {
  if (embedding.length === 0) return false;
  return embedding.some((value) => Number.isFinite(value) && Math.abs(value) > 0);
};

export const cosineSimilarity = (
  left: ReadonlyArray<number>,
  right: ReadonlyArray<number>
): number => {
  if (!hasUsableEmbedding(left) || !hasUsableEmbedding(right)) return 0;

  const size = Math.min(left.length, right.length);
  if (size === 0) return 0;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < size; index += 1) {
    const leftValue = normalizeFinite(left[index]);
    const rightValue = normalizeFinite(right[index]);
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return clamp(dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)), -1, 1);
};

export const computeSemanticScore = (
  memoryEmbedding: ReadonlyArray<number>,
  queryEmbedding: ReadonlyArray<number>
): number => {
  const similarity = cosineSimilarity(memoryEmbedding, queryEmbedding);
  return clamp((similarity + 1) / 2, 0, 1);
};

export const computeRecencyScore = (timestampIso: string, nowIso: string): number => {
  const ageMs = Math.max(0, isoToUnixMs(nowIso) - isoToUnixMs(timestampIso));
  const ageDays = ageMs / DAY_MS;
  return clamp(1 / (1 + ageDays / 14), 0, 1);
};

export const computeEmotionalScore = (emotionalValence: number): number => {
  return clamp(Math.abs(emotionalValence), 0, 1);
};

export const computeFrequencyScore = (accessCount: number): number => {
  const normalized = Math.log10(Math.max(1, accessCount) + 1) / Math.log10(101);
  return clamp(normalized, 0, 1);
};

export const computeMultiSignalBreakdown = (
  memory: MemoryNode,
  queryEmbedding: ReadonlyArray<number>,
  nowIso: string
): RetrievalSignalBreakdown => {
  return {
    semantic: computeSemanticScore(memory.embedding, queryEmbedding),
    recency: computeRecencyScore(memory.timestampIso, nowIso),
    emotional: computeEmotionalScore(memory.emotionalValence),
    frequency: computeFrequencyScore(memory.accessCount),
  };
};

export const applyWeightedScore = (
  breakdown: RetrievalSignalBreakdown,
  weights: RetrievalWeights = DEFAULT_RETRIEVAL_WEIGHTS
): number => {
  const weighted =
    breakdown.semantic * weights.semantic +
    breakdown.recency * weights.recency +
    breakdown.emotional * weights.emotional +
    breakdown.frequency * weights.frequency;

  return clamp(weighted, 0, 1);
};

export const retrieveMemoriesWithScoring = (params: {
  candidates: ReadonlyArray<MemoryNode>;
  queryEmbedding: ReadonlyArray<number>;
  nowIso: string;
  limit?: number;
  weights?: RetrievalWeights;
}): RetrievalResult => {
  const limit = Math.max(1, params.limit ?? 10);
  const weights = params.weights ?? DEFAULT_RETRIEVAL_WEIGHTS;

  let discardedWithoutEmbedding = 0;

  const scored: RetrievalScoredMemory[] = params.candidates.map((memory) => {
    if (!hasUsableEmbedding(memory.embedding)) {
      discardedWithoutEmbedding += 1;
    }

    const breakdown = computeMultiSignalBreakdown(memory, params.queryEmbedding, params.nowIso);
    const score = applyWeightedScore(breakdown, weights);
    return { memory, score, breakdown };
  });

  const selected = scored
    .slice()
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return {
    selected,
    weights,
    formula: 'semantic(0.4)+recency(0.3)+emotional(0.2)+frequency(0.1)',
    discardedWithoutEmbedding,
  };
};

const hashToken = (token: string): number => {
  let hash = 17;
  for (const char of token) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
};

export const buildDeterministicEmbedding = (
  text: string,
  dimensions = DEFAULT_EMBEDDING_DIMENSIONS
): number[] => {
  const vector = new Array<number>(Math.max(8, dimensions)).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    vector[0] = 1;
    return vector;
  }

  for (const token of tokens) {
    const hash = hashToken(token);
    const slot = hash % vector.length;
    const sign = hash % 2 === 0 ? 1 : -1;
    vector[slot] += sign * (1 + token.length / 12);
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;

  return vector.map((value) => value / magnitude);
};
