import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Memory } from '../../../../types';
import type { SupabaseLike } from '../base';
import { MemoryRepository } from '../memoryRepository';

const createMemory = (overrides: Partial<Memory> = {}): Memory => ({
  id: overrides.id ?? 'memory-1',
  content: overrides.content ?? 'A memory',
  type: overrides.type ?? 'episodic',
  embedding: overrides.embedding ?? [0.1, 0.2],
  timestamp: overrides.timestamp ?? Date.now(),
  decayFactor: overrides.decayFactor ?? 1,
  connections: overrides.connections ?? [],
  emotionalValence: overrides.emotionalValence ?? 0.2,
  metadata: overrides.metadata ?? {},
});

describe('MemoryRepository', () => {
  let from: ReturnType<typeof vi.fn>;
  let repository: MemoryRepository;

  beforeEach(() => {
    from = vi.fn();
    const client = { from, rpc: vi.fn() } as unknown as SupabaseLike;
    repository = new MemoryRepository(client);
  });

  it('lists recent memories by user with limit', async () => {
    const rows = [createMemory({ id: 'm-1' })];
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select });

    const result = await repository.listRecentByUser('user-1', 5);

    expect(from).toHaveBeenCalledWith('memories');
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limit).toHaveBeenCalledWith(5);
    expect(result).toEqual(rows);
  });

  it('upserts a memory payload', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });

    await repository.upsertMemory({ id: 'memory-2', user_id: 'u-1' });

    expect(from).toHaveBeenCalledWith('memories');
    expect(upsert).toHaveBeenCalledWith({ id: 'memory-2', user_id: 'u-1' });
  });

  it('updates memory decay factor', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });

    await repository.updateDecay('memory-3', 0.65);

    expect(from).toHaveBeenCalledWith('memories');
    expect(update).toHaveBeenCalledWith({ decay_factor: 0.65 });
    expect(eq).toHaveBeenCalledWith('id', 'memory-3');
  });

  it('deletes a memory by id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ delete: del });

    await repository.deleteMemory('memory-delete');

    expect(from).toHaveBeenCalledWith('memories');
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'memory-delete');
  });
});
