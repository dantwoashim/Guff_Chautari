import '@testing-library/jest-dom';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}

const createStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
};

if (typeof window !== 'undefined') {
  if (!window.localStorage || typeof window.localStorage.clear !== 'function') {
    Object.defineProperty(window, 'localStorage', {
      value: createStorage(),
      configurable: true,
    });
  }

  if (!window.sessionStorage || typeof window.sessionStorage.clear !== 'function') {
    Object.defineProperty(window, 'sessionStorage', {
      value: createStorage(),
      configurable: true,
    });
  }
}
