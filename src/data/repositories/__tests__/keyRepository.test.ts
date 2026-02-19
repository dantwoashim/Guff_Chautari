import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseLike } from '../base';
import { KeyRepository } from '../keyRepository';

describe('KeyRepository', () => {
  let from: ReturnType<typeof vi.fn>;
  let repository: KeyRepository;

  beforeEach(() => {
    from = vi.fn();
    const client = { from, rpc: vi.fn() } as unknown as SupabaseLike;
    repository = new KeyRepository(client);
  });

  it('upserts BYOK metadata', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });

    await repository.upsertMetadata('user-1', {
      provider: 'gemini',
      fingerprint: '****1234',
      lastValidatedAt: '2026-03-30T10:20:30.000Z',
    });

    expect(from).toHaveBeenCalledWith('byok_keys');
    expect(upsert).toHaveBeenCalledWith({
      user_id: 'user-1',
      provider: 'gemini',
      fingerprint: '****1234',
      last_validated_at: '2026-03-30T10:20:30.000Z',
    });
  });

  it('gets metadata and maps snake_case fields to camelCase', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        provider: 'gemini',
        fingerprint: '****2345',
        last_validated_at: '2026-03-30T10:20:30.000Z',
      },
      error: null,
    });
    const eqProvider = vi.fn().mockReturnValue({ maybeSingle });
    const eqUser = vi.fn().mockReturnValue({ eq: eqProvider });
    const select = vi.fn().mockReturnValue({ eq: eqUser });
    from.mockReturnValue({ select });

    const result = await repository.getMetadata('user-2', 'gemini');

    expect(from).toHaveBeenCalledWith('byok_keys');
    expect(select).toHaveBeenCalledWith('provider, fingerprint, last_validated_at');
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-2');
    expect(eqProvider).toHaveBeenCalledWith('provider', 'gemini');
    expect(result).toEqual({
      provider: 'gemini',
      fingerprint: '****2345',
      lastValidatedAt: '2026-03-30T10:20:30.000Z',
    });
  });

  it('returns null when metadata does not exist', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqProvider = vi.fn().mockReturnValue({ maybeSingle });
    const eqUser = vi.fn().mockReturnValue({ eq: eqProvider });
    const select = vi.fn().mockReturnValue({ eq: eqUser });
    from.mockReturnValue({ select });

    const result = await repository.getMetadata('user-missing', 'gemini');
    expect(result).toBeNull();
  });

  it('deletes metadata by user and provider', async () => {
    const eqProvider = vi.fn().mockResolvedValue({ error: null });
    const eqUser = vi.fn().mockReturnValue({ eq: eqProvider });
    const del = vi.fn().mockReturnValue({ eq: eqUser });
    from.mockReturnValue({ delete: del });

    await repository.deleteMetadata('user-3', 'gemini');

    expect(from).toHaveBeenCalledWith('byok_keys');
    expect(del).toHaveBeenCalled();
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-3');
    expect(eqProvider).toHaveBeenCalledWith('provider', 'gemini');
  });
});
