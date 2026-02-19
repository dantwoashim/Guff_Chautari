import { beforeEach, describe, expect, it } from 'vitest';
import { ApiKeyManager } from '../auth';
import { createApiGateway } from '../gateway';

describe('api gateway foundation', () => {
  const authManager = new ApiKeyManager({
    storageKey: 'ashim.api.auth.test.gateway',
  });

  beforeEach(() => {
    authManager.resetForTests();
  });

  it('boots and returns a healthy v1 endpoint response', async () => {
    const gateway = createApiGateway({
      authManager,
    });
    const runtime = gateway.boot('2026-02-18T00:00:00.000Z');
    expect(runtime.version).toBe('v1');
    expect(runtime.routeCount).toBeGreaterThanOrEqual(1);

    const response = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/health',
    });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    if (!response.body.ok) {
      throw new Error('Expected successful health response.');
    }
    expect(response.body.data).toMatchObject({
      status: 'ok',
      version: 'v1',
    });
  });

  it('authenticates key, enforces scope, and rejects unauthorized capability', async () => {
    const gateway = createApiGateway({
      authManager,
    });

    gateway.registerRoute({
      method: 'GET',
      path: '/v1/knowledge/sources',
      meta: {
        name: 'knowledge.sources.list',
        requiresAuth: true,
        requireWorkspace: true,
        requiredCapability: 'knowledge:read',
      },
      handler: () => ({
        data: {
          sources: ['note-1', 'note-2'],
        },
      }),
    });

    gateway.registerRoute({
      method: 'POST',
      path: '/v1/knowledge/ingest',
      meta: {
        name: 'knowledge.ingest',
        requiresAuth: true,
        requireWorkspace: true,
        requiredCapability: 'knowledge:write',
      },
      handler: () => ({
        status: 201,
        data: {
          accepted: true,
        },
      }),
    });

    const issued = authManager.issueApiKey({
      ownerUserId: 'api-owner',
      label: 'read-only test key',
      scope: 'read_only',
      workspaceScopes: ['workspace-1'],
      nowIso: '2026-02-18T00:00:00.000Z',
    });

    const readResponse = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/knowledge/sources',
      headers: {
        authorization: `Bearer ${issued.apiKey}`,
        'x-workspace-id': 'workspace-1',
      },
    });

    expect(readResponse.status).toBe(200);
    expect(readResponse.body.ok).toBe(true);

    const writeResponse = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/knowledge/ingest',
      headers: {
        authorization: `Bearer ${issued.apiKey}`,
        'x-workspace-id': 'workspace-1',
      },
      body: {
        text: 'new note',
      },
    });

    expect(writeResponse.status).toBe(403);
    expect(writeResponse.body.ok).toBe(false);
    if (writeResponse.body.ok || !('error' in writeResponse.body)) {
      throw new Error('Expected forbidden response.');
    }
    expect(writeResponse.body.error.code).toBe('forbidden');

    const workspaceScopeViolation = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/knowledge/sources',
      headers: {
        authorization: `Bearer ${issued.apiKey}`,
        'x-workspace-id': 'workspace-2',
      },
    });

    expect(workspaceScopeViolation.status).toBe(403);
    expect(workspaceScopeViolation.body.ok).toBe(false);
    if (workspaceScopeViolation.body.ok || !('error' in workspaceScopeViolation.body)) {
      throw new Error('Expected workspace scope violation.');
    }
    expect(workspaceScopeViolation.body.error.code).toBe('workspace_scope_denied');
  });
});
