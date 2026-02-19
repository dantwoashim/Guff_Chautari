import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateGeminiKey, validateProviderKey } from '../keyHealth';

describe('validateGeminiKey', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns healthy status for valid key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await validateGeminiKey('AIza-valid-key');
    expect(result.ok).toBe(true);
    expect(result.status).toBe('healthy');
  });

  it('returns invalid status for unauthorized key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'API key is invalid',
          },
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const result = await validateGeminiKey('AIza-invalid-key');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.errorCode).toBe('auth_failed');
  });

  it('validates openai provider keys via provider validator', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await validateProviderKey('openai', 'sk-valid-key');
    expect(result.ok).toBe(true);
    expect(result.status).toBe('healthy');
  });
});
