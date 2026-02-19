import {
  API_SCOPE_CAPABILITY_MATRIX,
  type ApiAuthToken,
  type ApiCapability,
  type ApiErrorCode,
  type ApiKeyScope,
  type ApiRequestPrincipal,
} from './types';
import {
  runtimeApiKeyRepository,
  runtimeBillingRepository,
  type RuntimeApiKeyRepository,
  type RuntimeBillingRepository,
} from '../data/repositories';
import { isSupabasePersistenceEnabled } from '../runtime/persistenceMode';

const DEFAULT_STORAGE_KEY = 'ashim.api.auth.v1';
const API_KEY_PREFIX = 'ashim_api';
const HOUR_MS = 60 * 60 * 1000;
const LEGACY_API_KEY_RUNTIME_SCOPE_TYPE = 'api_key_record';
const API_KEY_RUNTIME_SCHEMA_VERSION = 1;
const API_KEY_RUNTIME_VERSION = 1;
const SECRET_HASH_VERSION = 'v2';
const LEGACY_SECRET_HASH_VERSION = 'v1';

const inMemoryStorage = new Map<string, string>();

type ApiKeyStatus = 'active' | 'rotating' | 'revoked';

export interface ApiKeyRecord {
  id: string;
  ownerUserId: string;
  label: string;
  scope: ApiKeyScope;
  capabilities: ApiCapability[];
  workspaceScopes: string[];
  status: ApiKeyStatus;
  hashedSecret: string;
  secretPreview: string;
  createdAtIso: string;
  updatedAtIso: string;
  lastUsedAtIso?: string;
  expiresAtIso?: string;
  gracePeriodEndsAtIso?: string;
  rotatedToKeyId?: string;
}

interface ApiAuthState {
  keys: ApiKeyRecord[];
  updatedAtIso: string;
}

export interface IssueApiKeyInput {
  ownerUserId: string;
  label: string;
  scope: ApiKeyScope;
  workspaceScopes?: ReadonlyArray<string>;
  expiresAtIso?: string;
  nowIso?: string;
}

export interface IssueApiKeyResult {
  apiKey: string;
  token: ApiAuthToken;
  record: ApiKeyRecord;
}

export interface RotateApiKeyResult {
  previous: ApiKeyRecord;
  next: IssueApiKeyResult;
}

export interface AuthenticateApiKeyInput {
  apiKey: string;
  workspaceId?: string | null;
  requiredCapability?: ApiCapability;
  nowIso?: string;
}

export interface AuthenticateApiKeySuccess {
  ok: true;
  principal: ApiRequestPrincipal;
  token: ApiAuthToken;
  record: ApiKeyRecord;
}

export interface AuthenticateApiKeyFailure {
  ok: false;
  code: ApiErrorCode;
  reason: string;
}

export type AuthenticateApiKeyResult = AuthenticateApiKeySuccess | AuthenticateApiKeyFailure;

export const isApiKeyAuthFailure = (
  result: AuthenticateApiKeyResult
): result is AuthenticateApiKeyFailure => result.ok === false;

type ApiKeyPersistenceMode = 'auto' | 'enabled' | 'disabled';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const toHex = (bytes: Uint8Array): string => {
  let output = '';
  for (const value of bytes) {
    output += value.toString(16).padStart(2, '0');
  }
  return output;
};

const randomSecret = (size = 24): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return toHex(bytes);
  }

  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let output = '';
  for (let index = 0; index < size * 2; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return output;
};

const fnv32 = (input: string, seed: number): number => {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const hashSecretV1 = (secret: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < secret.length; index += 1) {
    hash ^= secret.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

// Deterministic lightweight hash that is stronger than legacy v1 while staying sync.
const hashSecretV2 = (secret: string): string => {
  const normalized = secret.trim();
  const saltA = `ashim.api.auth.v2:${normalized.length}`;
  const saltB = saltA.split('').reverse().join('');
  const materialA = `${saltA}|${normalized}`;
  const materialB = `${saltB}|${normalized}`;

  const partA = fnv32(materialA, 2166136261);
  const partB = fnv32(materialB, 374761393);
  const partC = fnv32(`${materialA}:${partB.toString(16)}`, 668265263);
  const partD = fnv32(`${partA.toString(16)}:${materialB}`, 2246822519);

  return [partA, partB, partC, partD]
    .map((value) => value.toString(16).padStart(8, '0'))
    .join('');
};

const hashSecret = (secret: string): string => `${SECRET_HASH_VERSION}:${hashSecretV2(secret)}`;

const isSecretMatch = (storedHash: string, secret: string): boolean => {
  const normalized = storedHash.trim();
  if (normalized.startsWith(`${SECRET_HASH_VERSION}:`)) {
    return safeEquals(normalized, hashSecret(secret));
  }
  if (normalized.startsWith(`${LEGACY_SECRET_HASH_VERSION}:`)) {
    const legacyBody = normalized.slice(`${LEGACY_SECRET_HASH_VERSION}:`.length);
    return safeEquals(legacyBody, hashSecretV1(secret));
  }
  return safeEquals(normalized, hashSecretV1(secret));
};

const safeEquals = (left: string, right: string): boolean => {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const toMs = (iso?: string): number => {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizeWorkspaceScopes = (workspaceScopes?: ReadonlyArray<string>): string[] => {
  if (!workspaceScopes || workspaceScopes.length === 0) return ['*'];
  const normalized = [
    ...new Set(workspaceScopes.map((value) => value.trim()).filter((value) => value.length > 0)),
  ];
  if (normalized.includes('*')) return ['*'];
  return normalized.sort((left, right) => left.localeCompare(right));
};

const isExpired = (record: ApiKeyRecord, nowIso: string): boolean => {
  if (!record.expiresAtIso) return false;
  return toMs(record.expiresAtIso) > 0 && toMs(record.expiresAtIso) <= toMs(nowIso);
};

const isRotatingAndValid = (record: ApiKeyRecord, nowIso: string): boolean => {
  if (record.status !== 'rotating') return false;
  if (!record.gracePeriodEndsAtIso) return false;
  return toMs(record.gracePeriodEndsAtIso) > toMs(nowIso);
};

const canAuthenticate = (record: ApiKeyRecord, nowIso: string): boolean => {
  if (record.status === 'revoked') return false;
  if (isExpired(record, nowIso)) return false;
  if (record.status === 'active') return true;
  return isRotatingAndValid(record, nowIso);
};

const parseApiKey = (rawApiKey: string): { keyId: string; secret: string } | null => {
  const input = rawApiKey.trim();
  const match = input.match(/^ashim_api_([^_]+)_(.+)$/);
  if (!match) return null;
  return {
    keyId: match[1],
    secret: match[2],
  };
};

const composeApiKey = (keyId: string, secret: string): string => `${API_KEY_PREFIX}_${keyId}_${secret}`;

const readRaw = (storageKey: string): string | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      // Fallback to in-memory storage.
    }
  }
  return inMemoryStorage.get(storageKey) ?? null;
};

const writeRaw = (storageKey: string, payload: string): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(storageKey, payload);
      return;
    } catch {
      // Fallback to in-memory storage.
    }
  }
  inMemoryStorage.set(storageKey, payload);
};

const defaultState = (): ApiAuthState => ({
  keys: [],
  updatedAtIso: new Date(0).toISOString(),
});

const isValidState = (value: unknown): value is ApiAuthState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ApiAuthState>;
  return Array.isArray(candidate.keys);
};

const isApiKeyRecord = (value: unknown): value is ApiKeyRecord => {
  const candidate = asRecord(value);
  if (!candidate) return false;

  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) return false;
  if (typeof candidate.ownerUserId !== 'string' || candidate.ownerUserId.trim().length === 0) return false;
  if (typeof candidate.label !== 'string') return false;
  if (candidate.scope !== 'read_only' && candidate.scope !== 'read_write' && candidate.scope !== 'admin') {
    return false;
  }
  if (!Array.isArray(candidate.capabilities) || !Array.isArray(candidate.workspaceScopes)) return false;
  if (candidate.status !== 'active' && candidate.status !== 'rotating' && candidate.status !== 'revoked') {
    return false;
  }
  if (typeof candidate.hashedSecret !== 'string' || candidate.hashedSecret.length === 0) return false;
  if (typeof candidate.secretPreview !== 'string') return false;
  if (typeof candidate.createdAtIso !== 'string' || typeof candidate.updatedAtIso !== 'string') return false;
  return true;
};

const toApiKeyRecord = (value: unknown): ApiKeyRecord | null => {
  if (!isApiKeyRecord(value)) return null;
  return {
    ...value,
    capabilities: [...value.capabilities],
    workspaceScopes: [...value.workspaceScopes],
  };
};

const parsePersistedApiKeyRecord = (payload: unknown): ApiKeyRecord | null => {
  const record = asRecord(payload);
  if (!record) return null;
  if (isApiKeyRecord(record)) return toApiKeyRecord(record);
  return toApiKeyRecord(record.apiKey);
};

const hasCapability = (record: ApiKeyRecord, capability: ApiCapability): boolean =>
  record.capabilities.includes(capability);

const hasWorkspaceAccess = (record: ApiKeyRecord, workspaceId?: string | null): boolean => {
  if (!workspaceId) return true;
  if (record.workspaceScopes.includes('*')) return true;
  return record.workspaceScopes.includes(workspaceId);
};

const toToken = (record: ApiKeyRecord): ApiAuthToken => ({
  tokenType: 'api_key',
  keyId: record.id,
  scope: record.scope,
  capabilities: [...record.capabilities],
  workspaceScopes: [...record.workspaceScopes],
  issuedAtIso: record.createdAtIso,
  expiresAtIso: record.expiresAtIso,
});

const toPrincipal = (record: ApiKeyRecord, nowIso: string): ApiRequestPrincipal => ({
  keyId: record.id,
  ownerUserId: record.ownerUserId,
  scope: record.scope,
  capabilities: [...record.capabilities],
  workspaceScopes: [...record.workspaceScopes],
  authenticatedAtIso: nowIso,
  expiresAtIso: record.expiresAtIso,
});

export class ApiKeyManager {
  private readonly storageKey: string;
  private readonly runtimeRepository: Pick<RuntimeApiKeyRepository, 'saveKeyState' | 'listByKeyId'>;
  private readonly legacyRuntimeRepository:
    | Pick<RuntimeBillingRepository, 'saveState' | 'listStatesByScope'>
    | null;
  private readonly persistenceMode: ApiKeyPersistenceMode;

  constructor(options: {
    storageKey?: string;
    runtimeRepository?: Pick<RuntimeApiKeyRepository, 'saveKeyState' | 'listByKeyId'>;
    legacyRuntimeRepository?: Pick<RuntimeBillingRepository, 'saveState' | 'listStatesByScope'> | null;
    persistenceMode?: ApiKeyPersistenceMode;
  } = {}) {
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.runtimeRepository = options.runtimeRepository ?? runtimeApiKeyRepository;
    this.legacyRuntimeRepository =
      options.legacyRuntimeRepository === undefined
        ? runtimeBillingRepository
        : options.legacyRuntimeRepository;
    this.persistenceMode = options.persistenceMode ?? 'auto';
  }

  private loadState(): ApiAuthState {
    const raw = readRaw(this.storageKey);
    if (!raw) return defaultState();

    try {
      const parsed = JSON.parse(raw);
      if (!isValidState(parsed)) return defaultState();
      return {
        keys: [...parsed.keys],
        updatedAtIso:
          typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
      };
    } catch {
      return defaultState();
    }
  }

  private saveState(state: ApiAuthState): void {
    writeRaw(
      this.storageKey,
      JSON.stringify({
        ...state,
        keys: [...state.keys],
        updatedAtIso: new Date().toISOString(),
      } satisfies ApiAuthState)
    );
  }

  private updateState(updater: (state: ApiAuthState) => ApiAuthState): ApiAuthState {
    const current = this.loadState();
    const next = updater(current);
    this.saveState(next);
    return next;
  }

  private isRemotePersistenceEnabled(): boolean {
    if (this.persistenceMode === 'enabled') return true;
    if (this.persistenceMode === 'disabled') return false;
    return isSupabasePersistenceEnabled();
  }

  private async persistRecord(record: ApiKeyRecord): Promise<void> {
    if (!this.isRemotePersistenceEnabled()) return;

    let persisted = false;
    try {
      await this.runtimeRepository.saveKeyState({
        userId: record.ownerUserId,
        keyId: record.id,
        state: {
          apiKey: record,
        },
        schemaVersion: API_KEY_RUNTIME_SCHEMA_VERSION,
        version: API_KEY_RUNTIME_VERSION,
      });
      persisted = true;
    } catch {
      // Fall through to legacy persistence fallback.
    }

    if (persisted || !this.legacyRuntimeRepository) {
      return;
    }

    try {
      await this.legacyRuntimeRepository.saveState({
        userId: record.ownerUserId,
        scopeType: LEGACY_API_KEY_RUNTIME_SCOPE_TYPE,
        scopeId: record.id,
        state: {
          apiKey: record,
        },
        schemaVersion: API_KEY_RUNTIME_SCHEMA_VERSION,
        version: API_KEY_RUNTIME_VERSION,
      });
    } catch {
      // Local state remains authoritative fallback if remote persistence fails.
    }
  }

  private mergePersistedRecords(records: ReadonlyArray<ApiKeyRecord>): void {
    if (records.length === 0) return;
    this.updateState((state) => {
      const byId = new Map<string, ApiKeyRecord>();
      for (const record of state.keys) {
        byId.set(record.id, {
          ...record,
          capabilities: [...record.capabilities],
          workspaceScopes: [...record.workspaceScopes],
        });
      }
      for (const record of records) {
        byId.set(record.id, {
          ...record,
          capabilities: [...record.capabilities],
          workspaceScopes: [...record.workspaceScopes],
        });
      }
      return {
        ...state,
        keys: [...byId.values()].sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso)),
        updatedAtIso: new Date().toISOString(),
      };
    });
  }

  private async loadRemoteRecordsByKeyId(keyId: string): Promise<ApiKeyRecord[]> {
    if (!this.isRemotePersistenceEnabled()) return [];
    const records: ApiKeyRecord[] = [];

    try {
      const rows = await this.runtimeRepository.listByKeyId(keyId);
      for (const row of rows) {
        const parsed = parsePersistedApiKeyRecord(row.payload);
        if (!parsed) continue;
        if (parsed.id !== keyId) continue;
        records.push(parsed);
      }
    } catch {
      // Continue to legacy fallback below.
    }

    if (records.length === 0 && this.legacyRuntimeRepository) {
      try {
        const rows = await this.legacyRuntimeRepository.listStatesByScope({
          scopeType: LEGACY_API_KEY_RUNTIME_SCOPE_TYPE,
          scopeId: keyId,
        });
        for (const row of rows) {
          const parsed = parsePersistedApiKeyRecord(row.payload);
          if (!parsed) continue;
          if (parsed.id !== keyId) continue;
          records.push(parsed);
        }
      } catch {
        return [];
      }
    }

    if (records.length > 0) {
      this.mergePersistedRecords(records);
    }
    return records;
  }

  issueApiKey(payload: IssueApiKeyInput): IssueApiKeyResult {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const keyId = makeId('api-key');
    const secret = randomSecret();
    const capabilities = [...API_SCOPE_CAPABILITY_MATRIX[payload.scope]];
    const workspaceScopes = normalizeWorkspaceScopes(payload.workspaceScopes);
    const record: ApiKeyRecord = {
      id: keyId,
      ownerUserId: payload.ownerUserId,
      label: payload.label.trim() || 'API key',
      scope: payload.scope,
      capabilities,
      workspaceScopes,
      status: 'active',
      hashedSecret: hashSecret(secret),
      secretPreview: `${secret.slice(0, 4)}...${secret.slice(-2)}`,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      expiresAtIso: payload.expiresAtIso,
    };

    this.updateState((state) => ({
      ...state,
      keys: [record, ...state.keys.filter((key) => key.id !== record.id)],
      updatedAtIso: nowIso,
    }));
    void this.persistRecord(record);

    return {
      apiKey: composeApiKey(record.id, secret),
      token: toToken(record),
      record,
    };
  }

  rotateApiKey(payload: {
    ownerUserId: string;
    keyId: string;
    gracePeriodHours?: number;
    nowIso?: string;
  }): RotateApiKeyResult {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const state = this.loadState();
    const existing = state.keys.find((key) => key.id === payload.keyId && key.ownerUserId === payload.ownerUserId);
    if (!existing) {
      throw new Error(`API key ${payload.keyId} not found for user ${payload.ownerUserId}.`);
    }
    if (existing.status === 'revoked') {
      throw new Error(`API key ${payload.keyId} is revoked and cannot be rotated.`);
    }

    const next = this.issueApiKey({
      ownerUserId: existing.ownerUserId,
      label: existing.label,
      scope: existing.scope,
      workspaceScopes: existing.workspaceScopes,
      expiresAtIso: existing.expiresAtIso,
      nowIso,
    });

    const gracePeriodHours = Math.max(1, payload.gracePeriodHours ?? 24);
    const gracePeriodEndsAtIso = new Date(toMs(nowIso) + gracePeriodHours * HOUR_MS).toISOString();

    let previousRecord = existing;
    this.updateState((current) => {
      const keys = current.keys.map((key) => {
        if (key.id !== existing.id) return key;
        previousRecord = {
          ...key,
          status: 'rotating',
          gracePeriodEndsAtIso,
          rotatedToKeyId: next.record.id,
          updatedAtIso: nowIso,
        };
        return previousRecord;
      });
      return {
        ...current,
        keys,
        updatedAtIso: nowIso,
      };
    });
    void this.persistRecord(previousRecord);

    return {
      previous: previousRecord,
      next,
    };
  }

  revokeApiKey(payload: { ownerUserId: string; keyId: string; nowIso?: string }): ApiKeyRecord {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    let revoked: ApiKeyRecord | null = null;

    this.updateState((state) => {
      const keys = state.keys.map((key) => {
        if (key.id !== payload.keyId || key.ownerUserId !== payload.ownerUserId) return key;
        revoked = {
          ...key,
          status: 'revoked',
          gracePeriodEndsAtIso: undefined,
          rotatedToKeyId: undefined,
          updatedAtIso: nowIso,
        };
        return revoked;
      });
      return {
        ...state,
        keys,
        updatedAtIso: nowIso,
      };
    });

    if (!revoked) {
      throw new Error(`API key ${payload.keyId} not found for user ${payload.ownerUserId}.`);
    }
    void this.persistRecord(revoked);
    return revoked;
  }

  listApiKeys(payload: { ownerUserId?: string; includeRevoked?: boolean } = {}): ApiKeyRecord[] {
    return this.loadState()
      .keys
      .filter((key) => (payload.ownerUserId ? key.ownerUserId === payload.ownerUserId : true))
      .filter((key) => (payload.includeRevoked ? true : key.status !== 'revoked'))
      .sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso));
  }

  authenticateApiKey(payload: AuthenticateApiKeyInput): AuthenticateApiKeyResult {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const parsed = parseApiKey(payload.apiKey);
    if (!parsed) {
      return {
        ok: false,
        code: 'unauthorized',
        reason: 'Malformed API key.',
      };
    }

    const state = this.loadState();
    const record = state.keys.find((item) => item.id === parsed.keyId);
    if (!record) {
      return {
        ok: false,
        code: 'unauthorized',
        reason: 'API key not found.',
      };
    }
    if (!isSecretMatch(record.hashedSecret, parsed.secret)) {
      return {
        ok: false,
        code: 'unauthorized',
        reason: 'API key secret mismatch.',
      };
    }
    if (!canAuthenticate(record, nowIso)) {
      return {
        ok: false,
        code: 'unauthorized',
        reason: 'API key is not active.',
      };
    }
    if (!hasWorkspaceAccess(record, payload.workspaceId)) {
      return {
        ok: false,
        code: 'workspace_scope_denied',
        reason: `API key ${record.id} is not allowed for workspace ${payload.workspaceId}.`,
      };
    }
    if (payload.requiredCapability && !hasCapability(record, payload.requiredCapability)) {
      return {
        ok: false,
        code: 'forbidden',
        reason: `API key scope ${record.scope} cannot access ${payload.requiredCapability}.`,
      };
    }

    const upgradedSecretHash = record.hashedSecret.startsWith(`${SECRET_HASH_VERSION}:`)
      ? record.hashedSecret
      : hashSecret(parsed.secret);

    let updatedRecord = record;
    this.updateState((current) => {
      const keys = current.keys.map((item) => {
        if (item.id !== record.id) return item;
        updatedRecord = {
          ...item,
          hashedSecret: upgradedSecretHash,
          lastUsedAtIso: nowIso,
          updatedAtIso: nowIso,
        };
        return updatedRecord;
      });
      return {
        ...current,
        keys,
        updatedAtIso: nowIso,
      };
    });

    if (updatedRecord.hashedSecret !== record.hashedSecret) {
      void this.persistRecord(updatedRecord);
    }

    return {
      ok: true,
      principal: toPrincipal(updatedRecord, nowIso),
      token: toToken(updatedRecord),
      record: updatedRecord,
    };
  }

  async authenticateApiKeyAsync(payload: AuthenticateApiKeyInput): Promise<AuthenticateApiKeyResult> {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const parsed = parseApiKey(payload.apiKey);
    if (!parsed) {
      return {
        ok: false,
        code: 'unauthorized',
        reason: 'Malformed API key.',
      };
    }

    let state = this.loadState();
    let candidates = state.keys.filter((item) => item.id === parsed.keyId);
    if (candidates.length === 0) {
      await this.loadRemoteRecordsByKeyId(parsed.keyId);
      state = this.loadState();
      candidates = state.keys.filter((item) => item.id === parsed.keyId);
    }

    const record = candidates.find((candidate) => isSecretMatch(candidate.hashedSecret, parsed.secret)) ?? null;
    if (!record) {
      return {
        ok: false,
        code: 'unauthorized',
        reason: 'API key not found.',
      };
    }
    if (!canAuthenticate(record, nowIso)) {
      return {
        ok: false,
        code: 'unauthorized',
        reason: 'API key is not active.',
      };
    }
    if (!hasWorkspaceAccess(record, payload.workspaceId)) {
      return {
        ok: false,
        code: 'workspace_scope_denied',
        reason: `API key ${record.id} is not allowed for workspace ${payload.workspaceId}.`,
      };
    }
    if (payload.requiredCapability && !hasCapability(record, payload.requiredCapability)) {
      return {
        ok: false,
        code: 'forbidden',
        reason: `API key scope ${record.scope} cannot access ${payload.requiredCapability}.`,
      };
    }

    const upgradedSecretHash = record.hashedSecret.startsWith(`${SECRET_HASH_VERSION}:`)
      ? record.hashedSecret
      : hashSecret(parsed.secret);

    let updatedRecord = record;
    this.updateState((current) => {
      const keys = current.keys.map((item) => {
        if (item.id !== record.id) return item;
        updatedRecord = {
          ...item,
          hashedSecret: upgradedSecretHash,
          lastUsedAtIso: nowIso,
          updatedAtIso: nowIso,
        };
        return updatedRecord;
      });
      return {
        ...current,
        keys,
        updatedAtIso: nowIso,
      };
    });
    await this.persistRecord(updatedRecord);

    return {
      ok: true,
      principal: toPrincipal(updatedRecord, nowIso),
      token: toToken(updatedRecord),
      record: updatedRecord,
    };
  }

  resetForTests(): void {
    this.saveState(defaultState());
  }
}

export const extractApiKeyFromHeaders = (
  headers: Record<string, string | undefined> = {}
): string | null => {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  const authorization = normalized.authorization?.trim();
  if (authorization && authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim() || null;
  }
  const xApiKey = normalized['x-api-key']?.trim();
  return xApiKey || null;
};

export const apiKeyManager = new ApiKeyManager();
