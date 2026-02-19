import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeyManager, isApiKeyAuthFailure } from '../auth';

describe('api key manager', () => {
  const manager = new ApiKeyManager({
    storageKey: 'ashim.api.auth.test.auth',
  });

  beforeEach(() => {
    manager.resetForTests();
  });

  it('generates and authenticates scoped keys', () => {
    const issued = manager.issueApiKey({
      ownerUserId: 'owner-1',
      label: 'rw key',
      scope: 'read_write',
      workspaceScopes: ['workspace-1'],
      nowIso: '2026-02-18T10:00:00.000Z',
    });

    const authSuccess = manager.authenticateApiKey({
      apiKey: issued.apiKey,
      workspaceId: 'workspace-1',
      requiredCapability: 'knowledge:write',
      nowIso: '2026-02-18T10:05:00.000Z',
    });

    expect(authSuccess.ok).toBe(true);
    if (!authSuccess.ok) {
      throw new Error('Expected successful key authentication.');
    }
    expect(authSuccess.principal.scope).toBe('read_write');
    expect(authSuccess.principal.capabilities).toContain('knowledge:write');

    const scopeViolation = manager.authenticateApiKey({
      apiKey: issued.apiKey,
      workspaceId: 'workspace-2',
      requiredCapability: 'knowledge:read',
      nowIso: '2026-02-18T10:05:30.000Z',
    });
    expect(scopeViolation.ok).toBe(false);
    if (!isApiKeyAuthFailure(scopeViolation)) {
      throw new Error('Expected workspace scope rejection.');
    }
    expect(scopeViolation.code).toBe('workspace_scope_denied');
  });

  it('supports key rotation with grace period', () => {
    const issued = manager.issueApiKey({
      ownerUserId: 'owner-2',
      label: 'rotation key',
      scope: 'read_only',
      workspaceScopes: ['workspace-1'],
      nowIso: '2026-02-18T11:00:00.000Z',
    });

    const rotated = manager.rotateApiKey({
      ownerUserId: 'owner-2',
      keyId: issued.record.id,
      gracePeriodHours: 1,
      nowIso: '2026-02-18T12:00:00.000Z',
    });

    const oldWithinGrace = manager.authenticateApiKey({
      apiKey: issued.apiKey,
      workspaceId: 'workspace-1',
      requiredCapability: 'knowledge:read',
      nowIso: '2026-02-18T12:30:00.000Z',
    });
    expect(oldWithinGrace.ok).toBe(true);

    const oldAfterGrace = manager.authenticateApiKey({
      apiKey: issued.apiKey,
      workspaceId: 'workspace-1',
      requiredCapability: 'knowledge:read',
      nowIso: '2026-02-18T13:30:00.000Z',
    });
    expect(oldAfterGrace.ok).toBe(false);
    if (!isApiKeyAuthFailure(oldAfterGrace)) {
      throw new Error('Expected old rotated key to expire after grace.');
    }
    expect(oldAfterGrace.code).toBe('unauthorized');

    const nextKeyAuth = manager.authenticateApiKey({
      apiKey: rotated.next.apiKey,
      workspaceId: 'workspace-1',
      requiredCapability: 'knowledge:read',
      nowIso: '2026-02-18T13:30:00.000Z',
    });
    expect(nextKeyAuth.ok).toBe(true);
  });

  it('authenticates keys via remote runtime persistence fallback', async () => {
    const seedManager = new ApiKeyManager({
      storageKey: 'ashim.api.auth.test.auth.seed',
    });
    seedManager.resetForTests();

    const issued = seedManager.issueApiKey({
      ownerUserId: 'owner-remote',
      label: 'remote key',
      scope: 'admin',
      workspaceScopes: ['workspace-1'],
      nowIso: '2026-02-18T14:00:00.000Z',
    });
    const seededRecord = seedManager.listApiKeys({
      ownerUserId: 'owner-remote',
      includeRevoked: true,
    })[0];
    if (!seededRecord) {
      throw new Error('Expected seeded API key record.');
    }

    const saveKeyState = vi.fn().mockResolvedValue({ error: null });
    const listByKeyId = vi.fn().mockResolvedValue([
      {
        id: 'rtbill-key-row',
        userId: seededRecord.ownerUserId,
        keyId: seededRecord.id,
        payload: {
          apiKey: seededRecord,
        },
        schemaVersion: 1,
        version: 1,
        createdAt: seededRecord.createdAtIso,
        updatedAt: seededRecord.updatedAtIso,
      },
    ]);

    const remoteAwareManager = new ApiKeyManager({
      storageKey: 'ashim.api.auth.test.auth.remote',
      runtimeRepository: {
        saveKeyState,
        listByKeyId,
      },
      legacyRuntimeRepository: null,
      persistenceMode: 'enabled',
    });
    remoteAwareManager.resetForTests();

    const authSuccess = await remoteAwareManager.authenticateApiKeyAsync({
      apiKey: issued.apiKey,
      workspaceId: 'workspace-1',
      requiredCapability: 'workspace:admin',
      nowIso: '2026-02-18T14:05:00.000Z',
    });

    expect(authSuccess.ok).toBe(true);
    expect(listByKeyId).toHaveBeenCalledWith(seededRecord.id);
    expect(saveKeyState).toHaveBeenCalled();
  });

  it('falls back to legacy billing persistence when dedicated repository is unavailable', async () => {
    const seedManager = new ApiKeyManager({
      storageKey: 'ashim.api.auth.test.auth.legacy.seed',
    });
    seedManager.resetForTests();

    const issued = seedManager.issueApiKey({
      ownerUserId: 'owner-legacy',
      label: 'legacy key',
      scope: 'read_only',
      workspaceScopes: ['workspace-1'],
      nowIso: '2026-02-18T16:00:00.000Z',
    });
    const seededRecord = seedManager.listApiKeys({
      ownerUserId: 'owner-legacy',
      includeRevoked: true,
    })[0];
    if (!seededRecord) {
      throw new Error('Expected seeded API key record.');
    }

    const listStatesByScope = vi.fn().mockResolvedValue([
      {
        id: 'rtbill-key-row',
        userId: seededRecord.ownerUserId,
        scopeType: 'api_key_record',
        scopeId: seededRecord.id,
        payload: {
          apiKey: seededRecord,
        },
        schemaVersion: 1,
        version: 1,
        createdAt: seededRecord.createdAtIso,
        updatedAt: seededRecord.updatedAtIso,
      },
    ]);

    const remoteAwareManager = new ApiKeyManager({
      storageKey: 'ashim.api.auth.test.auth.legacy.remote',
      runtimeRepository: {
        saveKeyState: vi.fn().mockRejectedValue(new Error('runtime_api_keys unavailable')),
        listByKeyId: vi.fn().mockRejectedValue(new Error('runtime_api_keys unavailable')),
      },
      legacyRuntimeRepository: {
        saveState: vi.fn().mockResolvedValue({ error: null }),
        listStatesByScope,
      },
      persistenceMode: 'enabled',
    });
    remoteAwareManager.resetForTests();

    const authSuccess = await remoteAwareManager.authenticateApiKeyAsync({
      apiKey: issued.apiKey,
      workspaceId: 'workspace-1',
      requiredCapability: 'knowledge:read',
      nowIso: '2026-02-18T16:05:00.000Z',
    });

    expect(authSuccess.ok).toBe(true);
    expect(listStatesByScope).toHaveBeenCalledWith({
      scopeType: 'api_key_record',
      scopeId: seededRecord.id,
    });
  });
});
