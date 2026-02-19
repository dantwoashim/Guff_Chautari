import { describe, expect, it } from 'vitest';
import { MemoryManager } from '../memoryManager';
import { buildDeterministicEmbedding } from '../retrieval';

describe('MemoryManager', () => {
  it('normalizes raw records and retrieves relevant memories', async () => {
    const manager = new MemoryManager({
      embedText: async (text) => buildDeterministicEmbedding(text),
      nowIso: () => '2026-05-20T12:00:00.000Z',
    });

    const records = [
      manager.normalizeRecord({
        id: 'm-1',
        user_id: 'user-1',
        type: 'semantic',
        content: 'Weekly benchmark planning for launch',
        embedding: buildDeterministicEmbedding('weekly benchmark planning for launch'),
        created_at: '2026-05-20T10:00:00.000Z',
        emotional_valence: 0.5,
        metadata: { accessCount: 7 },
      }),
      manager.normalizeRecord({
        id: 'm-2',
        user_id: 'user-1',
        type: 'semantic',
        content: 'Completely unrelated memory',
        embedding: buildDeterministicEmbedding('unrelated memory archive'),
        created_at: '2026-05-01T10:00:00.000Z',
        emotional_valence: 0.1,
        metadata: { accessCount: 1 },
      }),
    ];

    const result = await manager.retrieveRelevant({
      query: 'How do I benchmark launch progress weekly?',
      memories: records,
      limit: 2,
    });

    expect(result.selected.length).toBe(2);
    expect(result.selected[0].memory.id).toBe('m-1');
    expect(result.selected[0].score).toBeGreaterThan(result.selected[1].score);
  });
});

