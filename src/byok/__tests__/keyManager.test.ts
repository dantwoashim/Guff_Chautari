import { beforeEach, describe, expect, it } from 'vitest';
import { BYOKKeyManager } from '../keyManager';
import { getRuntimeGeminiKey, getRuntimeProviderKey } from '../runtimeKey';

const BYOK_STORAGE_KEY = 'ashim.byok.keys.v1';
const DEVICE_SECRET_STORAGE_KEY = 'ashim.byok.device_secret.v1';

describe('BYOKKeyManager', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    BYOKKeyManager.revokeAll();
  });

  it('encrypts and decrypts Gemini key roundtrip', async () => {
    const rawKey = 'AIzaSy-test-key-1234';

    await BYOKKeyManager.saveKey('gemini', rawKey);
    const decrypted = await BYOKKeyManager.getDecryptedKey('gemini');
    const stored = BYOKKeyManager.getStoredKey('gemini');

    expect(stored).not.toBeNull();
    expect(stored?.fingerprint).toContain('1234');
    expect(decrypted).toBe(rawKey);
    expect(getRuntimeGeminiKey()).toBe(rawKey);
  });

  it('revokes key material completely', async () => {
    const rawKey = 'AIzaSy-test-key-9876';
    await BYOKKeyManager.saveKey('gemini', rawKey);

    expect(window.localStorage.getItem(DEVICE_SECRET_STORAGE_KEY)).toBeTruthy();
    expect(BYOKKeyManager.hasKey('gemini')).toBe(true);

    BYOKKeyManager.revokeKey('gemini');

    const map = JSON.parse(window.localStorage.getItem(BYOK_STORAGE_KEY) || '{}') as Record<
      string,
      unknown
    >;

    expect(map.gemini).toBeUndefined();
    expect(window.localStorage.getItem(DEVICE_SECRET_STORAGE_KEY)).toBeNull();
    expect(getRuntimeGeminiKey()).toBeNull();
    expect(BYOKKeyManager.hasKey('gemini')).toBe(false);
  });

  it('stores and decrypts independent keys for multiple providers', async () => {
    await BYOKKeyManager.saveKey('gemini', 'gemini-1234');
    await BYOKKeyManager.saveKey('openai', 'openai-5678');
    await BYOKKeyManager.saveKey('anthropic', 'anthropic-9012');

    expect(await BYOKKeyManager.getDecryptedKey('gemini')).toBe('gemini-1234');
    expect(await BYOKKeyManager.getDecryptedKey('openai')).toBe('openai-5678');
    expect(await BYOKKeyManager.getDecryptedKey('anthropic')).toBe('anthropic-9012');

    expect(getRuntimeGeminiKey()).toBe('gemini-1234');
    expect(getRuntimeProviderKey('openai')).toBe('openai-5678');
    expect(getRuntimeProviderKey('anthropic')).toBe('anthropic-9012');
  });
});
