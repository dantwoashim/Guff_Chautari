export interface ManagedKeyRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  provider: string;
  label: string;
  encryptedValue: string;
  createdAtIso: string;
  updatedAtIso: string;
  rotateAtIso: string;
  gracePeriodUntilIso: string;
  revokedAtIso?: string;
  useCount: number;
  lastUsedAtIso?: string;
}

interface VaultEnvelopeV2 {
  v: 2;
  salt: string;
  iv: string;
  data: string;
}

const PBKDF2_ITERATIONS = 150_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
};

const base64ToBytes = (value: string): Uint8Array => {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(value, 'base64'));
};

const deriveSecret = (organizationId: string, workspaceId: string): string => {
  return `${organizationId}::${workspaceId}::ashim-enterprise-vault`;
};

const xorCipher = (value: string, secret: string): string => {
  if (!secret) return value;
  let out = '';
  for (let index = 0; index < value.length; index += 1) {
    const xor = value.charCodeAt(index) ^ secret.charCodeAt(index % secret.length);
    out += String.fromCharCode(xor);
  }
  return out;
};

const encryptLegacy = (plaintext: string, secret: string): string => {
  const payload = xorCipher(plaintext, secret);
  const bytes = new Uint8Array(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    bytes[index] = payload.charCodeAt(index);
  }
  return bytesToBase64(bytes);
};

const decryptLegacy = (ciphertext: string, secret: string): string => {
  const bytes = base64ToBytes(ciphertext);
  let payload = '';
  for (const value of bytes) {
    payload += String.fromCharCode(value);
  }
  return xorCipher(payload, secret);
};

const canUseSubtleCrypto = (): boolean =>
  typeof crypto !== 'undefined' &&
  typeof crypto.getRandomValues === 'function' &&
  typeof crypto.subtle !== 'undefined';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const deriveAesKey = async (secret: string, salt: Uint8Array): Promise<CryptoKey> => {
  if (!canUseSubtleCrypto()) {
    throw new Error('WebCrypto is not available in this environment.');
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
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

const parseV2Envelope = (ciphertext: string): VaultEnvelopeV2 => {
  const raw = ciphertext.slice(3);
  const parsed = JSON.parse(raw) as Partial<VaultEnvelopeV2>;
  if (
    parsed?.v !== 2 ||
    typeof parsed.salt !== 'string' ||
    typeof parsed.iv !== 'string' ||
    typeof parsed.data !== 'string'
  ) {
    throw new Error('Invalid vault envelope.');
  }
  return parsed as VaultEnvelopeV2;
};

const encrypt = async (plaintext: string, secret: string): Promise<string> => {
  if (!canUseSubtleCrypto()) {
    return encryptLegacy(plaintext, secret);
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveAesKey(secret, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  const envelope: VaultEnvelopeV2 = {
    v: 2,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  };
  return `v2:${JSON.stringify(envelope)}`;
};

const decrypt = async (ciphertext: string, secret: string): Promise<string> => {
  if (!ciphertext.startsWith('v2:')) {
    return decryptLegacy(ciphertext, secret);
  }

  if (!canUseSubtleCrypto()) {
    throw new Error('WebCrypto is required to decrypt v2 vault payloads.');
  }

  const envelope = parseV2Envelope(ciphertext);
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const encrypted = base64ToBytes(envelope.data);
  const key = await deriveAesKey(secret, salt);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return decoder.decode(decrypted);
};

export class ManagedKeyVault {
  private keysById = new Map<string, ManagedKeyRecord>();
  private workspaceAssignments = new Map<string, string>();

  async storeKey(payload: {
    organizationId: string;
    workspaceId: string;
    provider: string;
    label: string;
    plaintextKey: string;
    rotationDays?: number;
    graceDays?: number;
    nowIso?: string;
  }): Promise<ManagedKeyRecord> {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const rotationDays = Math.max(7, Math.min(365, Math.round(payload.rotationDays ?? 90)));
    const graceDays = Math.max(1, Math.min(30, Math.round(payload.graceDays ?? 7)));

    const secret = deriveSecret(payload.organizationId, payload.workspaceId);
    const encryptedValue = await encrypt(payload.plaintextKey, secret);

    const record: ManagedKeyRecord = {
      id: makeId('vault-key'),
      organizationId: payload.organizationId,
      workspaceId: payload.workspaceId,
      provider: payload.provider,
      label: payload.label,
      encryptedValue,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      rotateAtIso: new Date(toMs(nowIso) + rotationDays * 24 * 60 * 60 * 1000).toISOString(),
      gracePeriodUntilIso: new Date(
        toMs(nowIso) + (rotationDays + graceDays) * 24 * 60 * 60 * 1000
      ).toISOString(),
      useCount: 0,
    };

    this.keysById.set(record.id, record);
    this.workspaceAssignments.set(this.assignmentKey(payload.organizationId, payload.workspaceId), record.id);
    return record;
  }

  assignWorkspaceKey(payload: { organizationId: string; workspaceId: string; keyId: string }): void {
    const key = this.keysById.get(payload.keyId);
    if (!key) {
      throw new Error(`Key ${payload.keyId} not found.`);
    }
    if (key.organizationId !== payload.organizationId) {
      throw new Error(`Key ${payload.keyId} does not belong to organization ${payload.organizationId}.`);
    }

    this.workspaceAssignments.set(this.assignmentKey(payload.organizationId, payload.workspaceId), payload.keyId);
  }

  getWorkspaceAssignment(payload: { organizationId: string; workspaceId: string }): string | null {
    return this.workspaceAssignments.get(this.assignmentKey(payload.organizationId, payload.workspaceId)) ?? null;
  }

  async getDecryptedKey(payload: {
    organizationId: string;
    workspaceId: string;
    keyId?: string;
    nowIso?: string;
  }): Promise<string | null> {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const keyId =
      payload.keyId ?? this.workspaceAssignments.get(this.assignmentKey(payload.organizationId, payload.workspaceId));
    if (!keyId) return null;

    const record = this.keysById.get(keyId);
    if (!record || record.revokedAtIso) return null;

    const secret = deriveSecret(record.organizationId, record.workspaceId);
    let plaintext: string;
    try {
      plaintext = await decrypt(record.encryptedValue, secret);
    } catch {
      return null;
    }

    const updated: ManagedKeyRecord = {
      ...record,
      useCount: record.useCount + 1,
      lastUsedAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.keysById.set(record.id, updated);

    return plaintext;
  }

  async rotateKey(payload: {
    keyId: string;
    newPlaintextKey: string;
    rotationDays?: number;
    graceDays?: number;
    nowIso?: string;
  }): Promise<ManagedKeyRecord> {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const record = this.keysById.get(payload.keyId);
    if (!record) {
      throw new Error(`Key ${payload.keyId} not found.`);
    }

    const secret = deriveSecret(record.organizationId, record.workspaceId);
    const rotationDays = Math.max(7, Math.min(365, Math.round(payload.rotationDays ?? 90)));
    const graceDays = Math.max(1, Math.min(30, Math.round(payload.graceDays ?? 7)));

    const updated: ManagedKeyRecord = {
      ...record,
      encryptedValue: await encrypt(payload.newPlaintextKey, secret),
      updatedAtIso: nowIso,
      rotateAtIso: new Date(toMs(nowIso) + rotationDays * 24 * 60 * 60 * 1000).toISOString(),
      gracePeriodUntilIso: new Date(
        toMs(nowIso) + (rotationDays + graceDays) * 24 * 60 * 60 * 1000
      ).toISOString(),
      revokedAtIso: undefined,
    };

    this.keysById.set(record.id, updated);
    return updated;
  }

  revokeKey(payload: { keyId: string; nowIso?: string }): ManagedKeyRecord {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const record = this.keysById.get(payload.keyId);
    if (!record) {
      throw new Error(`Key ${payload.keyId} not found.`);
    }

    const updated: ManagedKeyRecord = {
      ...record,
      revokedAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.keysById.set(record.id, updated);
    return updated;
  }

  listKeys(payload: { organizationId: string; includeRevoked?: boolean }): ManagedKeyRecord[] {
    const includeRevoked = payload.includeRevoked ?? false;
    return [...this.keysById.values()]
      .filter((record) => record.organizationId === payload.organizationId)
      .filter((record) => (includeRevoked ? true : !record.revokedAtIso))
      .sort((left, right) => toMs(right.updatedAtIso) - toMs(left.updatedAtIso));
  }

  resetForTests(): void {
    this.keysById.clear();
    this.workspaceAssignments.clear();
  }

  private assignmentKey(organizationId: string, workspaceId: string): string {
    return `${organizationId}::${workspaceId}`;
  }
}

export const managedKeyVault = new ManagedKeyVault();
