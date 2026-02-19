import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Memory } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  addToShortTermCache,
  calculateSimilarity,
  getMemoriesByTier,
} from '../memoryService';

const createMemory = (id: string): Memory => ({
  id,
  content: `memory-${id}`,
  type: 'episodic',
  embedding: [1, 0, 0],
  timestamp: Date.now(),
  decayFactor: 1,
  connections: [],
  emotionalValence: 0.2,
  metadata: {},
});

describe('memoryService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates cosine similarity correctly', () => {
    expect(calculateSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 5);
    expect(calculateSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
    expect(calculateSimilarity([1], [1, 1])).toBe(0);
  });

  it('returns short-term cached memories without querying supabase', async () => {
    const fromSpy = vi.spyOn(supabase, 'from');
    const userId = `user-${Date.now()}`;
    const memory = createMemory('cached-1');
    addToShortTermCache(userId, memory);

    const result = await getMemoriesByTier(userId, 'short_term');

    expect(result[0]?.id).toBe('cached-1');
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
