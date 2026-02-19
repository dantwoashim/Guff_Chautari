import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseLike } from '../base';
import { RuntimeWorkflowStateRepository } from '../runtimeWorkflowStateRepository';

describe('RuntimeWorkflowStateRepository', () => {
  let from: ReturnType<typeof vi.fn>;
  let repository: RuntimeWorkflowStateRepository;

  beforeEach(() => {
    from = vi.fn();
    repository = new RuntimeWorkflowStateRepository({ from, rpc: vi.fn() } as unknown as SupabaseLike);
  });

  it('saves workflow state snapshots', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });

    await repository.saveState({
      userId: 'u-1',
      workspaceId: 'ws-1',
      namespaceUserId: 'api:workflows:u-1:ws-1',
      state: { workflows: [] },
    });

    expect(from).toHaveBeenCalledWith('runtime_workflow_state');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u-1',
        workspace_id: 'ws-1',
        namespace_user_id: 'api:workflows:u-1:ws-1',
      })
    );
  });

  it('loads workflow state snapshots', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'wf-1',
        user_id: 'u-1',
        workspace_id: 'ws-1',
        namespace_user_id: 'api:workflows:u-1:ws-1',
        state: { workflows: [{ id: 'w-1' }] },
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
      namespaceUserId: 'api:workflows:u-1:ws-1',
    });

    expect(result?.namespaceUserId).toBe('api:workflows:u-1:ws-1');
    expect(result?.state).toEqual({ workflows: [{ id: 'w-1' }] });
  });
});
