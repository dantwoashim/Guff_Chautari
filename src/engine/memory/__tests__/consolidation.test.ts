import { describe, expect, it } from 'vitest';
import { consolidateMemories } from '../consolidation';
import { buildDeterministicEmbedding } from '../retrieval';
import type { MemoryNode } from '../types';

const makeMemory = (overrides: Partial<MemoryNode> = {}): MemoryNode => ({
  id: overrides.id ?? 'memory-1',
  userId: overrides.userId ?? 'user-1',
  type: overrides.type ?? 'semantic',
  content: overrides.content ?? 'Default memory',
  embedding:
    overrides.embedding ?? buildDeterministicEmbedding(overrides.content ?? 'Default memory'),
  timestampIso: overrides.timestampIso ?? '2026-05-01T10:00:00.000Z',
  emotionalValence: overrides.emotionalValence ?? 0.1,
  accessCount: overrides.accessCount ?? 1,
  decayFactor: overrides.decayFactor ?? 0.6,
  metadata: overrides.metadata ?? {},
  provenance: overrides.provenance ?? [],
});

describe('memory consolidation', () => {
  it('plans merges, emotional strengthening, and decay in dry-run mode', () => {
    const nowIso = '2026-06-01T10:00:00.000Z';
    const similarBase = 'User launch checklist for weekly execution';

    const report = consolidateMemories({
      memories: [
        makeMemory({
          id: 'm-1',
          content: similarBase,
          embedding: buildDeterministicEmbedding(similarBase),
          emotionalValence: 0.82,
          accessCount: 2,
          decayFactor: 0.5,
        }),
        makeMemory({
          id: 'm-2',
          content: `${similarBase} with milestones`,
          embedding: buildDeterministicEmbedding(similarBase),
          emotionalValence: 0.78,
          accessCount: 2,
          decayFactor: 0.55,
        }),
        makeMemory({
          id: 'm-old',
          content: 'Low-value stale memory',
          embedding: buildDeterministicEmbedding('stale low value memory'),
          emotionalValence: 0.02,
          accessCount: 1,
          timestampIso: '2026-03-01T10:00:00.000Z',
          decayFactor: 0.4,
        }),
      ],
      nowIso,
      dryRun: true,
      mergeSimilarityThreshold: 0.85,
      decayAfterDays: 30,
      emotionalStrengthenThreshold: 0.75,
    });

    expect(report.dryRun).toBe(true);
    expect(report.mergePlans.length).toBe(1);
    expect(report.mergePlans[0].mergedIds).toContain('m-2');
    expect(report.strengthenedIds).toContain('m-1');
    expect(report.decayedIds).toContain('m-old');
    expect(report.summary.totalInput).toBe(3);
    expect(report.summary.totalOutput).toBe(2);
  });
});

