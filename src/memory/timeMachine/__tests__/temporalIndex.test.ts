import { describe, expect, it } from 'vitest';
import { buildTemporalMemoryIndex } from '../temporalIndex';
import type { MemorySnapshot } from '../types';

const buildSnapshot = (overrides: Partial<MemorySnapshot>): MemorySnapshot => ({
  id: overrides.id ?? 'snapshot-1',
  userId: overrides.userId ?? 'user-temporal',
  occurredAtIso: overrides.occurredAtIso ?? '2026-01-05T09:00:00.000Z',
  lane: overrides.lane ?? 'knowledge',
  topic: overrides.topic ?? 'experiments',
  summary: overrides.summary ?? 'Learned from weekly experiment.',
  sourceType: overrides.sourceType ?? 'manual',
  sourceId: overrides.sourceId ?? 'source-1',
  threadId: overrides.threadId,
  stance: overrides.stance,
  confidence: overrides.confidence,
  emotionalValence: overrides.emotionalValence,
  metadata: overrides.metadata,
});

describe('temporal memory index', () => {
  it('groups 30 days of snapshots by week and builds lane counts', () => {
    const userId = 'user-temporal';
    const start = Date.parse('2026-01-05T09:00:00.000Z'); // Monday

    const snapshots: MemorySnapshot[] = Array.from({ length: 30 }, (_, index) => {
      const atIso = new Date(start + index * 24 * 60 * 60 * 1000).toISOString();
      const laneCycle: MemorySnapshot['lane'][] = ['beliefs', 'goals', 'knowledge', 'decisions', 'emotion'];
      const lane = laneCycle[index % laneCycle.length];
      return buildSnapshot({
        id: `snapshot-${index}`,
        userId,
        occurredAtIso: atIso,
        lane,
        topic: lane === 'knowledge' ? `topic-${index}` : 'general',
        summary: `Signal ${index}`,
        sourceId: `source-${index}`,
        emotionalValence: lane === 'emotion' ? 0.6 : undefined,
        metadata: lane === 'emotion' ? { arousal: 0.45, message_count: 3 } : undefined,
      });
    });

    const index = buildTemporalMemoryIndex({
      userId,
      snapshots,
      nowIso: '2026-02-04T12:00:00.000Z',
    });

    expect(index.snapshots).toHaveLength(30);
    expect(index.events).toHaveLength(30);
    expect(index.weekGroups).toHaveLength(5);

    const firstWeekCount = index.weekGroups[0].eventIds.length;
    const lastWeekCount = index.weekGroups[index.weekGroups.length - 1].eventIds.length;

    expect(firstWeekCount).toBe(7);
    expect(lastWeekCount).toBe(2);
    expect(index.knowledgeGrowth.length).toBeGreaterThan(0);
    expect(index.emotionalEpochs.length).toBeGreaterThan(0);
  });
});
