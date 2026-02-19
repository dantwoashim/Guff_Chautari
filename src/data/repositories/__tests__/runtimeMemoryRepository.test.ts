import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseLike } from '../base';
import { RuntimeMemoryRepository } from '../runtimeMemoryRepository';

describe('RuntimeMemoryRepository', () => {
  let from: ReturnType<typeof vi.fn>;
  let repository: RuntimeMemoryRepository;

  beforeEach(() => {
    from = vi.fn();
    repository = new RuntimeMemoryRepository({ from, rpc: vi.fn() } as unknown as SupabaseLike);
  });

  it('upserts memory entries', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });

    await repository.upsertEntry({
      id: 'mem-1',
      userId: 'u-1',
      workspaceId: 'ws-1',
      appId: 'todoist',
      namespace: 'app.todoist.tasks',
      content: 'Ship roadmap',
      tags: ['roadmap'],
      metadata: { source: 'test' },
      emotionalValence: 0.2,
      decayFactor: 0.7,
      embedding: [0.1, 0.2],
    });

    expect(from).toHaveBeenCalledWith('runtime_memory_entries');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mem-1',
        user_id: 'u-1',
        workspace_id: 'ws-1',
        app_id: 'todoist',
        namespace: 'app.todoist.tasks',
      })
    );
  });

  it('lists entries by workspace', async () => {
    const rows = [{
      id: 'mem-1', user_id: 'u-1', workspace_id: 'ws-1', app_id: 'todoist', namespace: 'app.todoist.tasks',
      content: 'Ship roadmap', tags: ['roadmap'], metadata: {}, emotional_valence: 0.2,
      decay_factor: 0.7, embedding: [0.1], schema_version: 1, version: 1, created_at: 'now', updated_at: 'now',
    }];
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eqWorkspace = vi.fn().mockReturnValue({ order, or: vi.fn().mockReturnValue({ order }) });
    const eqUser = vi.fn().mockReturnValue({ eq: eqWorkspace });
    const select = vi.fn().mockReturnValue({ eq: eqUser });
    from.mockReturnValue({ select });

    const result = await repository.listByWorkspace({ userId: 'u-1', workspaceId: 'ws-1' });

    expect(result[0].id).toBe('mem-1');
    expect(result[0].tags).toEqual(['roadmap']);
  });
});
