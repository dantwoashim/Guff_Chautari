interface EncryptedPayload {
  encryptedData: string;
  iv: string;
  salt: string;
}

const DEVICE_SECRET_STORAGE_KEY = 'ashim.byok.device_secret.v1';
const PBKDF2_ITERATIONS = 210_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const assertCryptoAvailable = (): void => {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('WebCrypto is not available in this environment.');
  }
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const getOrCreateDeviceSecret = (): string => {
  if (typeof window === 'undefined') {
    throw new Error('localStorage is required for BYOK encryption.');
  }

  const existing = window.localStorage.getItem(DEVICE_SECRET_STORAGE_KEY);
  if (existing) return existing;

  const secretBytes = window.crypto.getRandomValues(new Uint8Array(32));
  const secret = bytesToBase64(secretBytes);
  window.localStorage.setItem(DEVICE_SECRET_STORAGE_KEY, secret);
  return secret;
};

export const clearByokDeviceSecret = (): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DEVICE_SECRET_STORAGE_KEY);
};

const deriveAesKey = async (secretBase64: string, salt: Uint8Array): Promise<CryptoKey> => {
  assertCryptoAvailable();
  const secretBytes = base64ToBytes(secretBase64);

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptApiKey = async (rawApiKey: string): Promise<EncryptedPayload> => {
  assertCryptoAvailable();
  const secret = getOrCreateDeviceSecret();
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveAesKey(secret, salt);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(rawApiKey.trim())
  );

  return {
    encryptedData: bytesToBase64(new Uint8Array(encryptedBuffer)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
  };
};

export const decryptApiKey = async (payload: EncryptedPayload): Promise<string> => {
  assertCryptoAvailable();
  const secret = getOrCreateDeviceSecret();
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const encryptedBytes = base64ToBytes(payload.encryptedData);
  const key = await deriveAesKey(secret, salt);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedBytes
  );

  return decoder.decode(decryptedBuffer);
};
