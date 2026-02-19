import { describe, expect, it } from 'vitest';
import {
  createCalendarConnector,
  createGDocsConnector,
  ConnectorRegistry,
  createImapConnector,
  createNotionConnector,
} from '../../connectors';
import { createInMemoryKnowledgeStoreAdapter, KnowledgeGraphStore } from '../../knowledge';
import { WorkspacePermissionMiddleware } from '../../team/permissions';
import { WorkspaceConversationService } from '../../team/workspaceConversationService';
import { WorkspaceManager } from '../../team/workspaceManager';
import {
  createInMemoryWorkflowChangeStoreAdapter,
  createInMemoryWorkflowCheckpointStoreAdapter,
  createInMemoryWorkflowStoreAdapter,
  WorkflowChangeHistory,
  WorkflowCheckpointManager,
  WorkflowEngine,
  WorkflowMemoryScope,
  WorkflowStore,
} from '../../workflows';
import { ApiAnalyticsTracker } from '../analytics';
import { ApiKeyManager } from '../auth';
import { MemoryConsentManager } from '../consentManager';
import { createApiGateway } from '../gateway';
import { MemoryProtocol } from '../memoryProtocol';
import { ApiRateLimiter } from '../rateLimiter';
import { ApiConversationRuntime, registerCoreApiRoutes } from '../routes';
import { ApiWebSocketServer } from '../websocket';

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected object payload.');
  }
  return value as Record<string, unknown>;
};

const buildHarness = () => {
  const workspaceManager = new WorkspaceManager();
  const workspacePermissionMiddleware = new WorkspacePermissionMiddleware({
    resolveActorRole: ({ workspaceId, userId }) =>
      workspaceManager.getMemberRole(workspaceId, userId),
    resolveWorkspaceOwnerUserId: (workspaceId) =>
      workspaceManager.getWorkspace(workspaceId)?.createdByUserId ?? null,
  });
  const conversationService = new WorkspaceConversationService({
    resolveMemberRole: ({ workspaceId, userId }) =>
      workspaceManager.getMemberRole(workspaceId, userId),
    resolveWorkspaceOwnerUserId: (workspaceId) =>
      workspaceManager.getWorkspace(workspaceId)?.createdByUserId ?? null,
  });
  const conversationRuntime = new ApiConversationRuntime();
  const knowledgeStore = new KnowledgeGraphStore(createInMemoryKnowledgeStoreAdapter());

  const registry = new ConnectorRegistry();
  registry.register(createImapConnector());
  registry.register(createNotionConnector());
  registry.register(createCalendarConnector());
  registry.register(createGDocsConnector());

  const workflowEngine = new WorkflowEngine({
    store: new WorkflowStore(createInMemoryWorkflowStoreAdapter()),
    registry,
    memoryScope: new WorkflowMemoryScope(),
    checkpointManager: new WorkflowCheckpointManager(createInMemoryWorkflowCheckpointStoreAdapter()),
    changeHistory: new WorkflowChangeHistory(createInMemoryWorkflowChangeStoreAdapter()),
  });

  const authManager = new ApiKeyManager({
    storageKey: `ashim.api.auth.test.week79_83.${Math.random().toString(16).slice(2)}`,
  });
  authManager.resetForTests();

  const gateway = createApiGateway({
    authManager,
  });

  registerCoreApiRoutes(gateway, {
    workspaceManager,
    workspacePermissionMiddleware,
    conversationService,
    conversationRuntime,
    knowledgeStore,
    workflowEngine,
    memoryProtocol: new MemoryProtocol(),
    consentManager: new MemoryConsentManager(),
    websocketServer: new ApiWebSocketServer(),
    rateLimiter: new ApiRateLimiter({
      limitPerMinute: 60,
    }),
    apiAnalytics: new ApiAnalyticsTracker(),
  });

  return {
    workspaceManager,
    authManager,
    gateway,
  };
};

describe('week 79-83 API routes', () => {
  it('evaluates certification candidates through admin API route', async () => {
    const { gateway, authManager, workspaceManager } = buildHarness();
    const created = workspaceManager.createWorkspace({
      ownerUserId: 'ops-owner',
      name: 'Ops Workspace',
      nowIso: '2026-10-20T03:00:00.000Z',
    });
    const workspaceId = created.workspace.id;

    const key = authManager.issueApiKey({
      ownerUserId: 'ops-owner',
      label: 'ops-admin',
      scope: 'admin',
      workspaceScopes: [workspaceId],
      nowIso: '2026-10-20T03:00:00.000Z',
    });

    const response = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/certification/evaluate',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        candidate: {
          id: 'template-founder-os',
          name: 'Founder OS Template',
          kind: 'template',
          version: '1.0.0',
          schemaValid: true,
          benchmarkScore: 0.86,
          safetySignals: [
            {
              id: 'safe',
              passed: true,
              severity: 'info',
              message: 'No critical issues.',
            },
          ],
          documentation: {
            readme: true,
            setupGuide: true,
            apiReference: true,
            changelog: true,
          },
          creator: {
            tier: 'Certified',
            approvedPackages: 4,
            trustScore: 0.88,
          },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    if (!response.body.ok) {
      throw new Error('Expected successful response.');
    }

    const data = asRecord(response.body.data);
    expect(data.certified).toBe(true);
    expect(data.level).toBe('gold');
  });

  it('returns self-host readiness and release gate reports', async () => {
    const { gateway, authManager, workspaceManager } = buildHarness();
    const created = workspaceManager.createWorkspace({
      ownerUserId: 'ops-owner-2',
      name: 'Ops Workspace 2',
      nowIso: '2026-10-20T03:00:00.000Z',
    });
    const workspaceId = created.workspace.id;

    const key = authManager.issueApiKey({
      ownerUserId: 'ops-owner-2',
      label: 'ops-admin-2',
      scope: 'admin',
      workspaceScopes: [workspaceId],
      nowIso: '2026-10-20T03:00:00.000Z',
    });

    const readiness = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/self-host/readiness',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        services: [
          { service: 'app', required: true, status: 'down' },
          { service: 'supabase-db', required: true, status: 'healthy' },
          { service: 'monitoring', required: false, status: 'degraded' },
        ],
      },
    });

    expect(readiness.status).toBe(200);
    expect(readiness.body.ok).toBe(true);
    if (!readiness.body.ok) {
      throw new Error('Expected readiness success response.');
    }
    const readinessData = asRecord(readiness.body.data);
    expect(readinessData.ready).toBe(false);

    const gate = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/release/gate',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        checks: [
          {
            id: 'tests',
            category: 'quality',
            label: 'All tests pass',
            status: 'fail',
            required: true,
          },
          {
            id: 'docs',
            category: 'documentation',
            label: 'Docs updated',
            status: 'pass',
            required: true,
          },
        ],
      },
    });

    expect(gate.status).toBe(200);
    expect(gate.body.ok).toBe(true);
    if (!gate.body.ok) {
      throw new Error('Expected release gate success response.');
    }
    const gateData = asRecord(gate.body.data);
    expect(gateData.ready).toBe(false);
  });
});
