import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseLike } from '../base';
import { RuntimeKnowledgeStateRepository } from '../runtimeKnowledgeStateRepository';

describe('RuntimeKnowledgeStateRepository', () => {
  let from: ReturnType<typeof vi.fn>;
  let repository: RuntimeKnowledgeStateRepository;

  beforeEach(() => {
    from = vi.fn();
    repository = new RuntimeKnowledgeStateRepository({ from, rpc: vi.fn() } as unknown as SupabaseLike);
  });

  it('saves knowledge state snapshots', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });

    await repository.saveState({
      userId: 'u-1',
      workspaceId: 'ws-1',
      namespaceUserId: 'api:knowledge:u-1:ws-1',
      state: { sources: [] },
    });

    expect(from).toHaveBeenCalledWith('runtime_knowledge_state');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u-1',
        workspace_id: 'ws-1',
        namespace_user_id: 'api:knowledge:u-1:ws-1',
      })
    );
  });

  it('loads knowledge state snapshots', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'kg-1',
        user_id: 'u-1',
        workspace_id: 'ws-1',
        namespace_user_id: 'api:knowledge:u-1:ws-1',
        state: { sources: [{ id: 's-1' }] },
        schema_version: 1,
        version: 1,
        created_at: 'now',
        updated_at: 'now',
      },
      error: null,
    });
    const eqNamespace = vi.fn().mockReturnValue({ maybeSingle });
    const eqWorkspace = vi.fn().mockReturnValue({ eq: eqNamespace });
    const eqUser = vi.fn().mockReturnValue({ eq: eqWorkspace });
    const select = vi.fn().mockReturnValue({ eq: eqUser });
    from.mockReturnValue({ select });

    const result = await repository.loadState({
      userId: 'u-1',
      workspaceId: 'ws-1',
      namespaceUserId: 'api:knowledge:u-1:ws-1',
    });

    expect(result?.namespaceUserId).toBe('api:knowledge:u-1:ws-1');
    expect(result?.state).toEqual({ sources: [{ id: 's-1' }] });
  });
});
