import { describe, expect, it } from 'vitest';
import { createBiometricAuthAdapter, createInMemorySecureStore, createMobileByokVault } from '../auth';

describe('week 90 biometric BYOK auth', () => {
  it('stores and retrieves provider key after biometric prompt', async () => {
    const secureStore = createInMemorySecureStore();
    const biometric = createBiometricAuthAdapter({ isAvailable: true, allowByDefault: true });
    const vault = createMobileByokVault({ secureStore, biometric });

    await vault.storeProviderKey({
      provider: 'gemini',
      apiKey: 'gemini-secret-key',
    });

    const retrieved = await vault.getProviderKey({
      provider: 'gemini',
      promptReason: 'Unlock Gemini key',
    });

    expect(retrieved).toBe('gemini-secret-key');
  });

  it('denies retrieval when biometric prompt fails', async () => {
    const vault = createMobileByokVault({
      biometric: createBiometricAuthAdapter({ isAvailable: true, allowByDefault: false }),
    });

    await vault.storeProviderKey({
      provider: 'openai',
      apiKey: 'openai-secret-key',
    });

    const retrieved = await vault.getProviderKey({
      provider: 'openai',
      promptReason: 'Unlock OpenAI key',
    });

    expect(retrieved).toBeNull();
  });
});
