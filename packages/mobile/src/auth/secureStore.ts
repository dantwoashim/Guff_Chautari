export interface SecureStoreAdapter {
  put: (key: string, encryptedValue: string) => Promise<void>;
  get: (key: string) => Promise<string | null>;
  remove: (key: string) => Promise<void>;
}

export const createInMemorySecureStore = (): SecureStoreAdapter => {
  const storage = new Map<string, string>();

  return {
    put: async (key, encryptedValue) => {
      storage.set(key, encryptedValue);
    },
    get: async (key) => storage.get(key) ?? null,
    remove: async (key) => {
      storage.delete(key);
    },
  };
};
