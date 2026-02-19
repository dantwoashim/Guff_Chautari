import { createBiometricAuthAdapter, type BiometricAuthAdapter } from './biometricAuth';
import { createInMemorySecureStore, type SecureStoreAdapter } from './secureStore';

const makeSalt = (): string => {
  return Math.random().toString(36).slice(2, 10);
};

const encode = (raw: string): string => {
  if (typeof btoa === 'function') return btoa(raw);
  return Buffer.from(raw, 'utf8').toString('base64');
};

const decode = (raw: string): string => {
  if (typeof atob === 'function') return atob(raw);
  return Buffer.from(raw, 'base64').toString('utf8');
};

const encrypt = (key: string): string => {
  const salt = makeSalt();
  return encode(`${salt}:${key}`);
};

const decrypt = (encrypted: string): string => {
  const decoded = decode(encrypted);
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex < 0) {
    throw new Error('invalid_encrypted_key');
  }
  return decoded.slice(separatorIndex + 1);
};

export interface MobileByokVault {
  storeProviderKey: (payload: { provider: string; apiKey: string }) => Promise<void>;
  getProviderKey: (payload: { provider: string; promptReason: string }) => Promise<string | null>;
  revokeProviderKey: (provider: string) => Promise<void>;
}

export const createMobileByokVault = (payload?: {
  secureStore?: SecureStoreAdapter;
  biometric?: BiometricAuthAdapter;
}): MobileByokVault => {
  const secureStore = payload?.secureStore ?? createInMemorySecureStore();
  const biometric = payload?.biometric ?? createBiometricAuthAdapter({ isAvailable: true, allowByDefault: true });

  return {
    storeProviderKey: async ({ provider, apiKey }) => {
      await secureStore.put(`provider:${provider}`, encrypt(apiKey));
    },
    getProviderKey: async ({ provider, promptReason }) => {
      const auth = await biometric.prompt(promptReason);
      if (!auth.ok) return null;

      const encrypted = await secureStore.get(`provider:${provider}`);
      if (!encrypted) return null;
      return decrypt(encrypted);
    },
    revokeProviderKey: async (provider) => {
      await secureStore.remove(`provider:${provider}`);
    },
  };
};
