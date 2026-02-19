import { beforeEach, describe, expect, it } from 'vitest';
import type { PipelineOrchestrator } from '@ashim/engine';
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
import { ApiKeyManager } from '../auth';
import { ApiAnalyticsTracker } from '../analytics';
import { MemoryConsentManager } from '../consentManager';
import { createApiGateway } from '../gateway';
import { MemoryProtocol } from '../memoryProtocol';
import { ApiRateLimiter } from '../rateLimiter';
import { ApiConversationRuntime, registerCoreApiRoutes } from '../routes';
import { ApiWebSocketServer } from '../websocket';

type GatewayResponse = Awaited<
  ReturnType<ReturnType<typeof buildHarness>['gateway']['handleRequest']>
>;

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected object payload.');
  }
  return value as Record<string, unknown>;
};

const asArray = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error('Expected array payload.');
  }
  return value;
};

const readData = (response: GatewayResponse): Record<string, unknown> => {
  expect(response.body.ok).toBe(true);
  if (!response.body.ok) {
    throw new Error('Expected success response.');
  }
  return asRecord(response.body.data);
};

const buildHarness = (options: { rateLimitPerMinute?: number } = {}) => {
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
    storageKey: `ashim.api.auth.test.week67_69.${Math.random().toString(16).slice(2)}`,
  });
  authManager.resetForTests();

  const gateway = createApiGateway({
    authManager,
  });

  const services = registerCoreApiRoutes(gateway, {
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
      limitPerMinute: options.rateLimitPerMinute ?? 60,
    }),
    apiAnalytics: new ApiAnalyticsTracker(),
    pipelineOrchestrator: {
      run: async () => ({
        identity: {
          variant: 'baseline_self',
          confidence: 0.91,
          energy: 0.65,
          reasons: ['stubbed-test'],
        },
        emotional: {
          surface: { label: 'calm', intensity: 0.4, rationale: 'stubbed' },
          felt: { label: 'calm', intensity: 0.3, rationale: 'stubbed' },
          suppressed: { label: 'neutral', intensity: 0.2, rationale: 'stubbed' },
          unconscious: { label: 'neutral', intensity: 0.1, rationale: 'stubbed' },
          emotionalDebt: 0,
          dischargeRisk: 0,
        },
        llm: {
          text: 'Stub pipeline response.',
          chunks: [
            { text: 'Stub ', index: 0, isFinal: false, receivedAt: Date.now() },
            { text: 'pipeline response.', index: 1, isFinal: true, receivedAt: Date.now() },
          ],
          cancelled: false,
          timedOut: false,
          providerId: 'stub-provider',
          model: 'stub-model',
        },
        humanized: {
          messages: [
            {
              text: 'Stub pipeline response.',
              chunkIndex: 0,
              totalChunks: 1,
              delayBefore: 0,
              typingDuration: 0,
              readDelay: 0,
              revision: { shouldRevise: false, pauseMs: 0, reason: 'none' },
            },
          ],
          strategicNonResponse: { shouldDelay: false, delayMs: 0, reason: 'none' },
        },
        learner: {
          extractedMemories: [
            {
              id: 'mem-stub',
              content: 'User is focused on weekly execution goals.',
              type: 'semantic',
              salience: 0.72,
              source: 'user',
            },
          ],
          relationshipUpdate: {
            stage: 'friend',
            trustDelta: 0.04,
            rationale: 'Consistent interaction quality.',
          },
          growthEvents: [
            {
              id: 'growth-stub',
              kind: 'interest_update',
              description: 'Execution planning preference reinforced.',
              queuedAt: Date.now(),
            },
          ],
        },
      }),
    } as unknown as PipelineOrchestrator,
  });

  return {
    workspaceManager,
    authManager,
    gateway,
    services,
  };
};

describe('week 67-69 API routes', () => {
  beforeEach(() => {
    // isolated harness per test
  });

  it('enforces memory consent + namespace isolation and supports cross-namespace recall', async () => {
    const { gateway, authManager, workspaceManager } = buildHarness();
    const created = workspaceManager.createWorkspace({
      ownerUserId: 'owner-memory',
      name: 'Memory Workspace',
      nowIso: '2026-02-18T03:00:00.000Z',
    });
    const workspaceId = created.workspace.id;

    const key = authManager.issueApiKey({
      ownerUserId: 'owner-memory',
      label: 'memory admin',
      scope: 'admin',
      workspaceScopes: [workspaceId],
      nowIso: '2026-02-18T03:00:00.000Z',
    });

    const grantTodoist = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/memory/consents/grant',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        appId: 'todoist',
        namespaces: ['app.todoist.tasks'],
        permissions: { read: true, write: true, consolidate: true },
      },
    });
    expect(grantTodoist.status).toBe(201);

    const grantNotion = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/memory/consents/grant',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        appId: 'notion',
        namespaces: ['app.notion.notes'],
        permissions: { read: true, write: true },
      },
    });
    expect(grantNotion.status).toBe(201);

    const writeTodoist = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/memory/write',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        appId: 'todoist',
        namespace: 'app.todoist.tasks',
        content: 'Ship weekly roadmap checkpoint every Friday.',
      },
    });
    expect(writeTodoist.status).toBe(201);

    const writeNotion = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/memory/write',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        appId: 'notion',
        namespace: 'app.notion.notes',
        content: 'Decision logs should include assumptions and confidence.',
      },
    });
    expect(writeNotion.status).toBe(201);

    const recallTodoistOnly = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/memory/recall',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      query: {
        q: 'weekly roadmap checkpoint',
        appId: 'todoist',
      },
    });
    expect(recallTodoistOnly.status).toBe(200);
    const todoistData = readData(recallTodoistOnly);
    const todoistHits = asArray(todoistData.hits);
    expect(todoistHits.length).toBeGreaterThan(0);
    const todoistNamespaces = todoistHits.map((hit) =>
      String(asRecord(hit).memory && asRecord(asRecord(hit).memory).namespace)
    );
    expect(new Set(todoistNamespaces)).toEqual(new Set(['app.todoist.tasks']));

    const recallAcrossNamespaces = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/memory/recall',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      query: {
        q: 'decision and roadmap',
        namespace: '*',
      },
    });
    expect(recallAcrossNamespaces.status).toBe(200);
    const crossData = readData(recallAcrossNamespaces);
    const crossHits = asArray(crossData.hits);
    const namespaces = new Set(
      crossHits.map((hit) =>
        String(asRecord(hit).memory && asRecord(asRecord(hit).memory).namespace)
      )
    );
    expect(namespaces.has('app.todoist.tasks')).toBe(true);
    expect(namespaces.has('app.notion.notes')).toBe(true);

    const invalidNamespaceWrite = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/memory/write',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        appId: 'todoist',
        namespace: 'app.notion.notes',
        content: 'Should not pass.',
      },
    });
    expect(invalidNamespaceWrite.status).toBe(400);

    const noConsentWrite = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/memory/write',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        appId: 'slack',
        namespace: 'app.slack.channels',
        content: 'No granted consent here.',
      },
    });
    expect(noConsentWrite.status).toBe(403);
  });

  it('runs headless pipeline and emits websocket stream events', async () => {
    const { gateway, authManager, workspaceManager, services } = buildHarness();
    const created = workspaceManager.createWorkspace({
      ownerUserId: 'owner-pipeline',
      name: 'Pipeline Workspace',
      nowIso: '2026-02-18T04:00:00.000Z',
    });
    const workspaceId = created.workspace.id;

    const key = authManager.issueApiKey({
      ownerUserId: 'owner-pipeline',
      label: 'pipeline key',
      scope: 'admin',
      workspaceScopes: [workspaceId],
      nowIso: '2026-02-18T04:00:00.000Z',
    });

    const connect = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/pipeline/stream/connect',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        appId: 'external-ui',
      },
    });
    expect(connect.status).toBe(201);
    const connectData = readData(connect);
    const connection = asRecord(connectData.connection);
    const connectionId = String(connection.id);

    const run = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/pipeline/run',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        message: 'Create a practical weekly plan for launch readiness.',
        persona: {
          id: 'founder-persona',
          name: 'Founder Coach',
          systemInstruction: 'Direct and practical.',
        },
        stream: {
          enabled: true,
          connectionId,
        },
      },
    });
    expect(run.status).toBe(200);

    const runData = readData(run);
    expect(asRecord(runData.response).text).toBeTruthy();
    expect(asRecord(runData.emotional).state).toBeTruthy();
    expect(asRecord(runData.learning).memoryUpdates).toBeTruthy();

    const events = services.websocketServer.readEvents(connectionId);
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((event) => event.type === 'pipeline.stage_complete')).toBe(true);
    expect(events.some((event) => event.type === 'pipeline.token')).toBe(true);
    expect(events.some((event) => event.type === 'pipeline.done')).toBe(true);
  });

  it('applies API key rate limits and exposes analytics usage dashboard', async () => {
    const { gateway, authManager, workspaceManager } = buildHarness({
      rateLimitPerMinute: 2,
    });
    const created = workspaceManager.createWorkspace({
      ownerUserId: 'owner-analytics',
      name: 'Analytics Workspace',
      nowIso: '2026-02-18T05:00:00.000Z',
    });
    const workspaceId = created.workspace.id;

    const rwKey = authManager.issueApiKey({
      ownerUserId: 'owner-analytics',
      label: 'rw key',
      scope: 'read_write',
      workspaceScopes: [workspaceId],
      nowIso: '2026-02-18T05:00:00.000Z',
    });

    const req1 = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/memory/consents',
      headers: {
        authorization: `Bearer ${rwKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
    });
    const req2 = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/memory/consents',
      headers: {
        authorization: `Bearer ${rwKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
    });
    const req3 = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/memory/consents',
      headers: {
        authorization: `Bearer ${rwKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
    });

    expect(req1.status).toBe(200);
    expect(req2.status).toBe(200);
    expect(req3.status).toBe(429);
    expect(req3.body.ok).toBe(false);
    if (req3.body.ok || !('error' in req3.body)) {
      throw new Error('Expected 429 response body.');
    }
    expect(req3.body.error.code).toBe('rate_limited');
    expect(req3.headers['retry-after']).toBeTruthy();

    const adminKey = authManager.issueApiKey({
      ownerUserId: 'owner-analytics',
      label: 'admin key',
      scope: 'admin',
      workspaceScopes: [workspaceId],
      nowIso: '2026-02-18T05:10:00.000Z',
    });

    await gateway.handleRequest({
      method: 'GET',
      path: '/v1/memory/consents',
      headers: {
        authorization: `Bearer ${adminKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
    });

    const analytics = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/analytics/usage',
      headers: {
        authorization: `Bearer ${adminKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      query: {
        windowMinutes: '120',
      },
    });

    expect(analytics.status).toBe(200);
    const analyticsData = readData(analytics);
    const keyUsage = asRecord(analyticsData.keyUsage);
    const keyWindow = asRecord(asRecord(asRecord(analyticsData.analytics).keyWindow));

    expect(Number(keyUsage.limitPerMinute)).toBe(2);
    expect(Number(keyUsage.consumedTotal)).toBeGreaterThanOrEqual(1);
    expect(Number(keyWindow.totalRequests)).toBeGreaterThanOrEqual(1);
  });
});
