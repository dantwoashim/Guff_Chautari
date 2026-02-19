import { clearByokDeviceSecret, decryptApiKey, encryptApiKey } from './keyEncryption';
import { clearAllRuntimeProviderKeys, clearRuntimeProviderKey, setRuntimeProviderKey } from './runtimeKey';
import { BYOK_PROVIDERS, type BYOKProvider, type EncryptedKeyBlob, type StoredKeyMap } from './types';

const BYOK_STORAGE_KEY = 'ashim.byok.keys.v1';
const encoder = new TextEncoder();

const assertStorageAvailable = (): void => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    throw new Error('localStorage is required for BYOK key management.');
  }
};

const readKeyMap = (): StoredKeyMap => {
  assertStorageAvailable();
  const raw = window.localStorage.getItem(BYOK_STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as StoredKeyMap;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const normalized: StoredKeyMap = {};
    for (const provider of BYOK_PROVIDERS) {
      const row = parsed[provider];
      if (!row) continue;
      normalized[provider] = row;
    }
    return normalized;
  } catch {
    return {};
  }
};

const writeKeyMap = (map: StoredKeyMap): void => {
  assertStorageAvailable();
  window.localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(map));
};

const hasAnyStoredKeys = (map: StoredKeyMap): boolean => {
  return BYOK_PROVIDERS.some((provider) => Boolean(map[provider]));
};

const toHex = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const makeFingerprint = async (rawKey: string): Promise<string> => {
  const trimmed = rawKey.trim();
  const last4 = trimmed.slice(-4).padStart(4, '*');
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(trimmed));
  const prefix = toHex(new Uint8Array(hashBuffer)).slice(0, 8);
  return `${last4}-${prefix}`;
};

export class BYOKKeyManager {
  static getStoredKey(provider: BYOKProvider): EncryptedKeyBlob | null {
    const map = readKeyMap();
    return map[provider] ?? null;
  }

  static hasKey(provider: BYOKProvider): boolean {
    return Boolean(this.getStoredKey(provider));
  }

  static async saveKey(provider: BYOKProvider, rawApiKey: string): Promise<EncryptedKeyBlob> {
    assertStorageAvailable();
    const encrypted = await encryptApiKey(rawApiKey);
    const fingerprint = await makeFingerprint(rawApiKey);
    const now = Date.now();

    const blob: EncryptedKeyBlob = {
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv,
      salt: encrypted.salt,
      fingerprint,
      provider,
      createdAt: now,
      lastValidated: now,
    };

    const map = readKeyMap();
    map[provider] = blob;
    writeKeyMap(map);

    setRuntimeProviderKey(provider, rawApiKey.trim());

    return blob;
  }

  static async getDecryptedKey(provider: BYOKProvider): Promise<string | null> {
    const blob = this.getStoredKey(provider);
    if (!blob) return null;

    try {
      const decrypted = await decryptApiKey({
        encryptedData: blob.encryptedData,
        iv: blob.iv,
        salt: blob.salt,
      });

      const normalized = decrypted.trim();
      setRuntimeProviderKey(provider, normalized);

      return normalized;
    } catch {
      return null;
    }
  }

  static touchValidation(provider: BYOKProvider): void {
    const map = readKeyMap();
    const existing = map[provider];
    if (!existing) return;
    map[provider] = {
      ...existing,
      lastValidated: Date.now(),
    };
    writeKeyMap(map);
  }

  static revokeKey(provider: BYOKProvider): void {
    const map = readKeyMap();
    delete map[provider];
    writeKeyMap(map);

    if (!hasAnyStoredKeys(map)) {
      clearByokDeviceSecret();
    }

    clearRuntimeProviderKey(provider);
  }

  static revokeAll(): void {
    writeKeyMap({});
    clearByokDeviceSecret();
    clearAllRuntimeProviderKeys();
  }
}
