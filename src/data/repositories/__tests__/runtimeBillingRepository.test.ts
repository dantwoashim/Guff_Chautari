import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseLike } from '../base';
import { RuntimeBillingRepository } from '../runtimeBillingRepository';

describe('RuntimeBillingRepository', () => {
  let from: ReturnType<typeof vi.fn>;
  let repository: RuntimeBillingRepository;

  beforeEach(() => {
    from = vi.fn();
    repository = new RuntimeBillingRepository({ from, rpc: vi.fn() } as unknown as SupabaseLike);
  });

  it('saves billing snapshots', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });

    await repository.saveState({
      userId: 'u-1',
      scopeType: 'workspace',
      scopeId: 'ws-1',
      state: { tier: 'pro' },
    });

    expect(from).toHaveBeenCalledWith('runtime_billing_state');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u-1',
        scope_type: 'workspace',
        scope_id: 'ws-1',
      }),
      expect.objectContaining({
        onConflict: 'user_id,scope_type,scope_id',
      })
    );
  });

  it('loads billing snapshots', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'bill-row-1', user_id: 'u-1', scope_type: 'workspace', scope_id: 'ws-1', payload: { tier: 'pro' },
        schema_version: 1, version: 1, created_at: 'now', updated_at: 'now',
      },
      error: null,
    });
    const eqScopeId = vi.fn().mockReturnValue({ maybeSingle });
    const eqScopeType = vi.fn().mockReturnValue({ eq: eqScopeId });
    const eqUser = vi.fn().mockReturnValue({ eq: eqScopeType });
    const select = vi.fn().mockReturnValue({ eq: eqUser });
    from.mockReturnValue({ select });

    const result = await repository.loadState({
      userId: 'u-1',
      scopeType: 'workspace',
      scopeId: 'ws-1',
    });

    expect(result?.scopeType).toBe('workspace');
    expect(result?.payload).toEqual({ tier: 'pro' });
  });

  it('lists billing snapshots by scope id', async () => {
    const eqScopeId = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'bill-row-1',
          user_id: 'u-1',
          scope_type: 'api_key_record',
          scope_id: 'api-key-1',
          payload: { apiKey: { id: 'api-key-1' } },
          schema_version: 1,
          version: 1,
          created_at: 'now',
          updated_at: 'now',
        },
        {
          id: 'bill-row-2',
          user_id: 'u-2',
          scope_type: 'api_key_record',
          scope_id: 'api-key-1',
          payload: { apiKey: { id: 'api-key-1' } },
          schema_version: 1,
          version: 1,
          created_at: 'now',
          updated_at: 'now',
        },
      ],
      error: null,
    });
    const eqScopeType = vi.fn().mockReturnValue({ eq: eqScopeId });
    const select = vi.fn().mockReturnValue({ eq: eqScopeType });
    from.mockReturnValue({ select });

    const rows = await repository.listStatesByScope({
      scopeType: 'api_key_record',
      scopeId: 'api-key-1',
    });

    expect(rows.length).toBe(2);
    expect(rows[0].scopeType).toBe('api_key_record');
  });
});
