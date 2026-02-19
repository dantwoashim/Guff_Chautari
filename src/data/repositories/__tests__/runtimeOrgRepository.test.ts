import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseLike } from '../base';
import { RuntimeOrgRepository } from '../runtimeOrgRepository';

describe('RuntimeOrgRepository', () => {
  let from: ReturnType<typeof vi.fn>;
  let repository: RuntimeOrgRepository;

  beforeEach(() => {
    from = vi.fn();
    repository = new RuntimeOrgRepository({ from, rpc: vi.fn() } as unknown as SupabaseLike);
  });

  it('saves organization snapshots', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });

    await repository.saveState({
      userId: 'u-1',
      organizationId: 'org-1',
      state: { name: 'Acme' },
    });

    expect(from).toHaveBeenCalledWith('runtime_org_state');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u-1',
        organization_id: 'org-1',
      })
    );
  });

  it('loads organization snapshots', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'org-row-1', user_id: 'u-1', organization_id: 'org-1', payload: { name: 'Acme' },
        schema_version: 1, version: 1, created_at: 'now', updated_at: 'now',
      },
      error: null,
    });
    const eqOrg = vi.fn().mockReturnValue({ maybeSingle });
    const eqUser = vi.fn().mockReturnValue({ eq: eqOrg });
    const select = vi.fn().mockReturnValue({ eq: eqUser });
    from.mockReturnValue({ select });

    const result = await repository.loadState({ userId: 'u-1', organizationId: 'org-1' });

    expect(result?.organizationId).toBe('org-1');
    expect(result?.payload).toEqual({ name: 'Acme' });
  });
});
