import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseLike } from '../base';
import { RuntimeWorkspaceRepository } from '../runtimeWorkspaceRepository';

describe('RuntimeWorkspaceRepository', () => {
  let from: ReturnType<typeof vi.fn>;
  let repository: RuntimeWorkspaceRepository;

  beforeEach(() => {
    from = vi.fn();
    repository = new RuntimeWorkspaceRepository({ from, rpc: vi.fn() } as unknown as SupabaseLike);
  });

  it('upserts workspace snapshots', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });

    await repository.upsertWorkspace({
      userId: 'u-1',
      workspaceId: 'ws-1',
      state: { name: 'Workspace 1' },
    });

    expect(from).toHaveBeenCalledWith('runtime_workspaces');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u-1',
        workspace_id: 'ws-1',
        payload: { name: 'Workspace 1' },
      })
    );
  });

  it('lists members for a workspace', async () => {
    const rows = [{
      id: 'm-1', user_id: 'u-1', workspace_id: 'ws-1', member_user_id: 'u-2', role: 'member', payload: {},
      schema_version: 1, version: 1, created_at: 'now', updated_at: 'now',
    }];
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eqWorkspace = vi.fn().mockReturnValue({ order });
    const eqUser = vi.fn().mockReturnValue({ eq: eqWorkspace });
    const select = vi.fn().mockReturnValue({ eq: eqUser });
    from.mockReturnValue({ select });

    const result = await repository.listMembers('u-1', 'ws-1');

    expect(from).toHaveBeenCalledWith('runtime_workspace_members');
    expect(result[0].memberUserId).toBe('u-2');
    expect(result[0].role).toBe('member');
  });
});
