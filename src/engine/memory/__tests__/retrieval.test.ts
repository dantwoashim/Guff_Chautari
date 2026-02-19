import { describe, expect, it } from 'vitest';
import {
  applyWeightedScore,
  buildDeterministicEmbedding,
  computeMultiSignalBreakdown,
  retrieveMemoriesWithScoring,
  toIsoTimestamp,
} from '../retrieval';
import type { MemoryNode } from '../types';

const makeMemory = (overrides: Partial<MemoryNode> = {}): MemoryNode => ({
  id: overrides.id ?? 'memory-1',
  userId: overrides.userId ?? 'user-1',
  type: overrides.type ?? 'semantic',
  content: overrides.content ?? 'Launch benchmark planning',
  embedding:
    overrides.embedding ?? buildDeterministicEmbedding(overrides.content ?? 'Launch benchmark planning'),
  timestampIso: overrides.timestampIso ?? '2026-05-19T12:00:00.000Z',
  emotionalValence: overrides.emotionalValence ?? 0.4,
  accessCount: overrides.accessCount ?? 4,
  decayFactor: overrides.decayFactor ?? 0.7,
  metadata: overrides.metadata ?? {},
  provenance: overrides.provenance ?? [],
});

describe('memory retrieval scoring', () => {
  it('normalizes timestamps to ISO 8601 from multiple formats', () => {
    expect(toIsoTimestamp(1_715_212_800_000)).toBe('2024-05-09T00:00:00.000Z');
    expect(toIsoTimestamp('1715212800')).toBe('2024-05-09T00:00:00.000Z');
    expect(toIsoTimestamp('2026-05-20T12:00:00Z')).toBe('2026-05-20T12:00:00.000Z');
  });

  it('scores memories with semantic/recency/emotional/frequency formula and tracks missing embeddings', () => {
    const nowIso = '2026-05-20T12:00:00.000Z';
    const queryEmbedding = buildDeterministicEmbedding('launch benchmark weekly plan');

    const aligned = makeMemory({
      id: 'aligned',
      content: 'Weekly launch benchmark and scorecard plan',
      embedding: buildDeterministicEmbedding('weekly launch benchmark and scorecard plan'),
      timestampIso: '2026-05-20T10:00:00.000Z',
      emotionalValence: 0.6,
      accessCount: 9,
    });

    const missingEmbedding = makeMemory({
      id: 'missing-embedding',
      content: 'Unrelated old memory',
      embedding: [],
      timestampIso: '2025-05-20T10:00:00.000Z',
      emotionalValence: 0.1,
      accessCount: 1,
    });

    const result = retrieveMemoriesWithScoring({
      candidates: [missingEmbedding, aligned],
      queryEmbedding,
      nowIso,
      limit: 2,
    });

    expect(result.formula).toBe('semantic(0.4)+recency(0.3)+emotional(0.2)+frequency(0.1)');
    expect(result.discardedWithoutEmbedding).toBe(1);
    expect(result.selected[0].memory.id).toBe('aligned');
    expect(result.selected[0].breakdown.semantic).toBeGreaterThan(result.selected[1].breakdown.semantic);
  });

  it('applies weighted score deterministically', () => {
    const breakdown = computeMultiSignalBreakdown(
      makeMemory({
        content: 'focused productivity systems',
        embedding: buildDeterministicEmbedding('focused productivity systems'),
      }),
      buildDeterministicEmbedding('focused productivity systems'),
      '2026-05-20T12:00:00.000Z'
    );

    const weighted = applyWeightedScore(breakdown);
    expect(weighted).toBeGreaterThanOrEqual(0);
    expect(weighted).toBeLessThanOrEqual(1);
  });
});
