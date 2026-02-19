import { MemoryManager, buildDeterministicEmbedding, toIsoTimestamp, type MemoryNode } from '../engine/memory';

export interface PlantedFact {
  id: string;
  fact: string;
  query: string;
  emotionalValence: number;
}

export interface MemoryRecallBenchmarkResult {
  plantedFacts: number;
  turns: number;
  recovered: number;
  recallRate: number;
  targetRate: number;
  passed: boolean;
  misses: string[];
}

const generatePlantedFacts = (count: number): PlantedFact[] => {
  const topics = [
    'launch date',
    'weekly benchmark',
    'distribution channel',
    'pricing model',
    'creator loop',
    'community metric',
    'content cadence',
    'retention target',
    'conversion baseline',
    'decision review',
  ];

  const facts: PlantedFact[] = [];
  for (let index = 0; index < count; index += 1) {
    const topic = topics[index % topics.length];
    const anchor = `anchor${index + 1}zxq${(index + 1) * 13}`;
    const factText = `Fact ${index + 1}: user's ${topic} is tracked explicitly in planning notes (${anchor}).`;
    facts.push({
      id: `fact-${index + 1}`,
      fact: factText,
      query: anchor,
      emotionalValence: 0.8,
    });
  }

  return facts;
};

const buildMemoryCorpus = (facts: ReadonlyArray<PlantedFact>, turns: number): MemoryNode[] => {
  const now = Date.UTC(2026, 4, 31, 12, 0, 0);

  const factMemories = facts.map((fact, index) => ({
    id: fact.id,
    userId: 'benchmark-user',
    type: 'semantic' as const,
    content: fact.fact,
    embedding: buildDeterministicEmbedding(fact.fact),
    timestampIso: toIsoTimestamp(now - (index + 1) * 3_600_000),
    emotionalValence: fact.emotionalValence,
    accessCount: 3 + (index % 4),
    decayFactor: 0.75,
    metadata: { planted: true, accessCount: 3 + (index % 4) },
    provenance: [],
  }));

  const noiseCount = Math.max(0, turns - facts.length);
  const noiseMemories = new Array(noiseCount).fill(0).map((_, index) => {
    const content = `Noise ${index + 1}: unrelated status note about generic productivity.`;
    return {
      id: `noise-${index + 1}`,
      userId: 'benchmark-user',
      type: 'semantic' as const,
      content,
      embedding: buildDeterministicEmbedding(content),
      timestampIso: toIsoTimestamp(now - (facts.length + index + 1) * 3_600_000),
      emotionalValence: 0.05,
      accessCount: 1,
      decayFactor: 0.35,
      metadata: { planted: false, accessCount: 1 },
      provenance: [],
    };
  });

  return [...factMemories, ...noiseMemories];
};

export const runMemoryRecallBenchmark = async (params: {
  factCount?: number;
  turns?: number;
  retrievalLimit?: number;
  targetRate?: number;
} = {}): Promise<MemoryRecallBenchmarkResult> => {
  const factCount = params.factCount ?? 20;
  const turns = params.turns ?? 100;
  const retrievalLimit = params.retrievalLimit ?? 3;
  const targetRate = params.targetRate ?? 0.65;

  const facts = generatePlantedFacts(factCount);
  const corpus = buildMemoryCorpus(facts, turns);
  const manager = new MemoryManager({
    embedText: async (text) => buildDeterministicEmbedding(text),
    nowIso: () => '2026-05-31T12:00:00.000Z',
  });

  let recovered = 0;
  const misses: string[] = [];

  for (const fact of facts) {
    const retrieval = await manager.retrieveRelevant({
      query: fact.query,
      memories: corpus,
      limit: retrievalLimit,
    });

    const hit = retrieval.selected.some((entry) => entry.memory.id === fact.id);
    if (hit) {
      recovered += 1;
    } else {
      misses.push(fact.id);
    }
  }

  const recallRate = factCount === 0 ? 0 : recovered / factCount;

  return {
    plantedFacts: factCount,
    turns,
    recovered,
    recallRate,
    targetRate,
    passed: recallRate >= targetRate,
    misses,
  };
};
