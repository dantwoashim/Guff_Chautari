const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const normalizeAppId = (appId: string): string => {
  const normalized = appId.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(normalized)) {
    throw new Error('appId must be 2-64 chars and contain only a-z, 0-9, dot, underscore, or dash.');
  }
  return normalized;
};

const normalizeNamespace = (namespace: string): string => {
  const normalized = namespace.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._:-]{2,127}$/.test(normalized)) {
    throw new Error('namespace is invalid.');
  }
  return normalized;
};

const dedupeNamespaces = (namespaces: ReadonlyArray<string>): string[] => {
  const normalized = namespaces
    .map((namespace) => normalizeNamespace(namespace))
    .filter((namespace) => namespace.length > 0);
  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
};

export const namespaceBelongsToApp = (appId: string, namespace: string): boolean => {
  const normalizedAppId = normalizeAppId(appId);
  const normalizedNamespace = normalizeNamespace(namespace);
  const prefix = `app.${normalizedAppId}`;
  return normalizedNamespace === prefix || normalizedNamespace.startsWith(`${prefix}.`);
};

export type MemoryConsentOperation = 'read' | 'write' | 'consolidate';

export interface MemoryConsentPermissions {
  read: boolean;
  write: boolean;
  consolidate: boolean;
}

export interface MemoryConsentUsage {
  readCount: number;
  writeCount: number;
  consolidateCount: number;
  lastReadAtIso?: string;
  lastWriteAtIso?: string;
  lastConsolidateAtIso?: string;
}

export interface MemoryConsentRecord {
  id: string;
  userId: string;
  workspaceId: string;
  appId: string;
  namespaces: string[];
  permissions: MemoryConsentPermissions;
  status: 'active' | 'revoked';
  grantedAtIso: string;
  grantedByUserId: string;
  updatedAtIso: string;
  revokedAtIso?: string;
  revokedByUserId?: string;
  usage: MemoryConsentUsage;
}

export interface GrantMemoryConsentInput {
  userId: string;
  workspaceId: string;
  appId: string;
  namespaces: ReadonlyArray<string>;
  grantedByUserId: string;
  permissions?: Partial<MemoryConsentPermissions>;
  nowIso?: string;
}

export interface RevokeMemoryConsentInput {
  userId: string;
  workspaceId: string;
  appId: string;
  revokedByUserId: string;
  namespace?: string;
  nowIso?: string;
}

const defaultUsage = (): MemoryConsentUsage => ({
  readCount: 0,
  writeCount: 0,
  consolidateCount: 0,
});

const consentKey = (payload: {
  userId: string;
  workspaceId: string;
  appId: string;
}): string => `${payload.userId}::${payload.workspaceId}::${normalizeAppId(payload.appId)}`;

const mergePermissions = (
  current: MemoryConsentPermissions,
  updates?: Partial<MemoryConsentPermissions>
): MemoryConsentPermissions => ({
  read: updates?.read ?? current.read,
  write: updates?.write ?? current.write,
  consolidate: updates?.consolidate ?? current.consolidate,
});

const defaultPermissions = (): MemoryConsentPermissions => ({
  read: true,
  write: true,
  consolidate: false,
});

const operationAllowed = (
  permissions: MemoryConsentPermissions,
  operation: MemoryConsentOperation
): boolean => {
  if (operation === 'read') return permissions.read;
  if (operation === 'write') return permissions.write;
  return permissions.consolidate;
};

export class MemoryConsentManager {
  private readonly recordsByKey = new Map<string, MemoryConsentRecord>();
  private readonly indexByWorkspace = new Map<string, string[]>();

  grant(input: GrantMemoryConsentInput): MemoryConsentRecord {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const appId = normalizeAppId(input.appId);
    const namespaces = dedupeNamespaces(input.namespaces);

    if (namespaces.length === 0) {
      throw new Error('At least one namespace is required.');
    }

    for (const namespace of namespaces) {
      if (!namespaceBelongsToApp(appId, namespace)) {
        throw new Error(`Namespace ${namespace} does not belong to app ${appId}.`);
      }
    }

    const key = consentKey({
      userId: input.userId,
      workspaceId: input.workspaceId,
      appId,
    });

    const existing = this.recordsByKey.get(key);
    const next: MemoryConsentRecord = existing
      ? {
          ...existing,
          status: 'active',
          namespaces,
          permissions: mergePermissions(existing.permissions, input.permissions),
          updatedAtIso: nowIso,
          revokedAtIso: undefined,
          revokedByUserId: undefined,
        }
      : {
          id: makeId('memory-consent'),
          userId: input.userId,
          workspaceId: input.workspaceId,
          appId,
          namespaces,
          permissions: mergePermissions(defaultPermissions(), input.permissions),
          status: 'active',
          grantedAtIso: nowIso,
          grantedByUserId: input.grantedByUserId,
          updatedAtIso: nowIso,
          usage: defaultUsage(),
        };

    this.recordsByKey.set(key, next);
    const workspaceIndexKey = `${input.userId}::${input.workspaceId}`;
    const keys = this.indexByWorkspace.get(workspaceIndexKey) ?? [];
    if (!keys.includes(key)) {
      this.indexByWorkspace.set(workspaceIndexKey, [key, ...keys]);
    }

    return {
      ...next,
      namespaces: [...next.namespaces],
      permissions: { ...next.permissions },
      usage: { ...next.usage },
    };
  }

  revoke(input: RevokeMemoryConsentInput): MemoryConsentRecord {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const key = consentKey({
      userId: input.userId,
      workspaceId: input.workspaceId,
      appId: input.appId,
    });
    const existing = this.recordsByKey.get(key);
    if (!existing || existing.status !== 'active') {
      throw new Error(`Active consent for app ${input.appId} not found.`);
    }

    const namespace = input.namespace ? normalizeNamespace(input.namespace) : undefined;
    const nextNamespaces = namespace
      ? existing.namespaces.filter((entry) => entry !== namespace)
      : [];

    const next: MemoryConsentRecord = {
      ...existing,
      namespaces: nextNamespaces,
      updatedAtIso: nowIso,
      status: nextNamespaces.length > 0 ? 'active' : 'revoked',
      revokedAtIso: nextNamespaces.length > 0 ? undefined : nowIso,
      revokedByUserId: nextNamespaces.length > 0 ? undefined : input.revokedByUserId,
    };

    this.recordsByKey.set(key, next);

    return {
      ...next,
      namespaces: [...next.namespaces],
      permissions: { ...next.permissions },
      usage: { ...next.usage },
    };
  }

  listForWorkspace(payload: {
    userId: string;
    workspaceId: string;
    includeRevoked?: boolean;
  }): MemoryConsentRecord[] {
    const workspaceKey = `${payload.userId}::${payload.workspaceId}`;
    const keys = this.indexByWorkspace.get(workspaceKey) ?? [];
    const records = keys
      .map((key) => this.recordsByKey.get(key))
      .filter((record): record is MemoryConsentRecord => Boolean(record));

    const filtered = payload.includeRevoked
      ? records
      : records.filter((record) => record.status === 'active');

    return filtered
      .slice()
      .sort((left, right) => Date.parse(right.updatedAtIso) - Date.parse(left.updatedAtIso))
      .map((record) => ({
        ...record,
        namespaces: [...record.namespaces],
        permissions: { ...record.permissions },
        usage: { ...record.usage },
      }));
  }

  getActiveConsent(payload: {
    userId: string;
    workspaceId: string;
    appId: string;
  }): MemoryConsentRecord | null {
    const key = consentKey(payload);
    const record = this.recordsByKey.get(key);
    if (!record || record.status !== 'active') return null;

    return {
      ...record,
      namespaces: [...record.namespaces],
      permissions: { ...record.permissions },
      usage: { ...record.usage },
    };
  }

  hasAccess(payload: {
    userId: string;
    workspaceId: string;
    appId: string;
    namespace: string;
    operation: MemoryConsentOperation;
  }): boolean {
    const record = this.getActiveConsent(payload);
    if (!record) return false;
    const namespace = normalizeNamespace(payload.namespace);

    if (!record.namespaces.includes(namespace)) return false;
    if (!namespaceBelongsToApp(record.appId, namespace)) return false;

    return operationAllowed(record.permissions, payload.operation);
  }

  assertAccess(payload: {
    userId: string;
    workspaceId: string;
    appId: string;
    namespace: string;
    operation: MemoryConsentOperation;
  }): void {
    if (!this.hasAccess(payload)) {
      throw new Error(
        `Consent denied for ${payload.operation} on namespace ${payload.namespace} by app ${payload.appId}.`
      );
    }
  }

  recordUsage(payload: {
    userId: string;
    workspaceId: string;
    appId: string;
    operation: MemoryConsentOperation;
    nowIso?: string;
  }): void {
    const key = consentKey(payload);
    const existing = this.recordsByKey.get(key);
    if (!existing) return;

    const nowIso = payload.nowIso ?? new Date().toISOString();
    const usage: MemoryConsentUsage = {
      ...existing.usage,
    };

    if (payload.operation === 'read') {
      usage.readCount += 1;
      usage.lastReadAtIso = nowIso;
    } else if (payload.operation === 'write') {
      usage.writeCount += 1;
      usage.lastWriteAtIso = nowIso;
    } else {
      usage.consolidateCount += 1;
      usage.lastConsolidateAtIso = nowIso;
    }

    this.recordsByKey.set(key, {
      ...existing,
      usage,
      updatedAtIso: nowIso,
    });
  }

  resetForTests(): void {
    this.recordsByKey.clear();
    this.indexByWorkspace.clear();
  }
}

export const memoryConsentManager = new MemoryConsentManager();
