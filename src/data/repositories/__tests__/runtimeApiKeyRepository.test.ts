import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseLike } from '../base';
import { RuntimeApiKeyRepository } from '../runtimeApiKeyRepository';

describe('RuntimeApiKeyRepository', () => {
  let from: ReturnType<typeof vi.fn>;
  let repository: RuntimeApiKeyRepository;

  beforeEach(() => {
    from = vi.fn();
    repository = new RuntimeApiKeyRepository({ from, rpc: vi.fn() } as unknown as SupabaseLike);
  });

  it('saves API key snapshots', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });

    await repository.saveKeyState({
      userId: 'u-1',
      keyId: 'key-1',
      state: { apiKey: { id: 'key-1' } },
    });

    expect(from).toHaveBeenCalledWith('runtime_api_keys');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u-1',
        key_id: 'key-1',
      }),
      expect.objectContaining({
        onConflict: 'user_id,key_id',
      })
    );
  });

  it('loads API key snapshots', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'row-1',
        user_id: 'u-1',
        key_id: 'key-1',
        payload: { apiKey: { id: 'key-1' } },
        schema_version: 1,
        version: 1,
        created_at: 'now',
        updated_at: 'now',
      },
      error: null,
    });
    const eqKey = vi.fn().mockReturnValue({ maybeSingle });
    const eqUser = vi.fn().mockReturnValue({ eq: eqKey });
    const select = vi.fn().mockReturnValue({ eq: eqUser });
    from.mockReturnValue({ select });

    const result = await repository.loadKeyState({
      userId: 'u-1',
      keyId: 'key-1',
    });

    expect(result?.keyId).toBe('key-1');
    expect(result?.payload).toEqual({ apiKey: { id: 'key-1' } });
  });

  it('lists API key snapshots by key id', async () => {
    const eqKey = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'row-1',
          user_id: 'u-1',
          key_id: 'key-1',
          payload: { apiKey: { id: 'key-1' } },
          schema_version: 1,
          version: 1,
          created_at: 'now',
          updated_at: 'now',
        },
        {
          id: 'row-2',
          user_id: 'u-2',
          key_id: 'key-1',
          payload: { apiKey: { id: 'key-1' } },
          schema_version: 1,
          version: 1,
          created_at: 'now',
          updated_at: 'now',
        },
      ],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ eq: eqKey });
    from.mockReturnValue({ select });

    const rows = await repository.listByKeyId('key-1');

    expect(rows.length).toBe(2);
    expect(rows[0].keyId).toBe('key-1');
  });
});
