import { BYOK_PROVIDERS, type BYOKProvider } from './types';

const runtimeKeyByProvider: Partial<Record<BYOKProvider, string>> = {};

const runtimeSessionStorageKey = (provider: BYOKProvider): string =>
  `ashim.byok.runtime.${provider}`;

const canUseSessionStorage = (): boolean => {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
};

export const setRuntimeGeminiKey = (apiKey: string | null): void => {
  setRuntimeProviderKey('gemini', apiKey);
};

export const getRuntimeGeminiKey = (): string | null => {
  return getRuntimeProviderKey('gemini');
};

export const clearRuntimeGeminiKey = (): void => {
  clearRuntimeProviderKey('gemini');
};

export const setRuntimeProviderKey = (
  provider: BYOKProvider,
  apiKey: string | null
): void => {
  if (apiKey && apiKey.trim().length > 0) {
    runtimeKeyByProvider[provider] = apiKey;
  } else {
    delete runtimeKeyByProvider[provider];
  }

  if (!canUseSessionStorage()) return;

  const sessionKey = runtimeSessionStorageKey(provider);
  if (apiKey && apiKey.trim().length > 0) {
    window.sessionStorage.setItem(sessionKey, apiKey);
  } else {
    window.sessionStorage.removeItem(sessionKey);
  }
};

export const getRuntimeProviderKey = (provider: BYOKProvider): string | null => {
  const inMemory = runtimeKeyByProvider[provider];
  if (inMemory && inMemory.trim().length > 0) {
    return inMemory;
  }
  if (!canUseSessionStorage()) return null;
  return window.sessionStorage.getItem(runtimeSessionStorageKey(provider));
};

export const clearRuntimeProviderKey = (provider: BYOKProvider): void => {
  setRuntimeProviderKey(provider, null);
};

export const clearAllRuntimeProviderKeys = (): void => {
  BYOK_PROVIDERS.forEach((provider) => {
    clearRuntimeProviderKey(provider);
  });
};
