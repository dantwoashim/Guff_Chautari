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
import { createApiGateway } from '../gateway';
import { ApiConversationRuntime, registerCoreApiRoutes } from '../routes';

const buildWeek66Harness = () => {
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
    storageKey: `ashim.api.auth.test.week66.${Math.random().toString(16).slice(2)}`,
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
    pipelineOrchestrator: {
      run: async () => ({
        identity: {
          variant: 'baseline_self',
          confidence: 0.9,
          energy: 0.7,
          reasons: ['week66-stub'],
        },
        emotional: {
          surface: { label: 'calm', intensity: 0.3, rationale: 'stub' },
          felt: { label: 'calm', intensity: 0.2, rationale: 'stub' },
          suppressed: { label: 'neutral', intensity: 0.1, rationale: 'stub' },
          unconscious: { label: 'neutral', intensity: 0.1, rationale: 'stub' },
          emotionalDebt: 0,
          dischargeRisk: 0,
        },
        llm: {
          text: 'Strategist: Pipeline reply',
          chunks: [{ text: 'Strategist: Pipeline reply', index: 0, isFinal: true, receivedAt: Date.now() }],
          cancelled: false,
          timedOut: false,
          providerId: 'stub-provider',
          model: 'stub-model',
        },
        humanized: {
          messages: [
            {
              text: 'Strategist: Pipeline reply',
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
          extractedMemories: [],
          relationshipUpdate: {
            stage: 'friend',
            trustDelta: 0.01,
            rationale: 'stub',
          },
          growthEvents: [],
        },
      }),
    } as unknown as PipelineOrchestrator,
  });

  return {
    workspaceManager,
    authManager,
    gateway,
  };
};

const assertErrorCode = (
  response: Awaited<ReturnType<ReturnType<typeof buildWeek66Harness>['gateway']['handleRequest']>>,
  code: string
): void => {
  expect(response.body.ok).toBe(false);
  if (response.body.ok || !('error' in response.body)) {
    throw new Error('Expected API error response.');
  }
  expect(response.body.error.code).toBe(code);
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected object response payload.');
  }
  return value as Record<string, unknown>;
};

const asArray = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error('Expected array response payload.');
  }
  return value;
};

const readSuccessData = (
  response: Awaited<ReturnType<ReturnType<typeof buildWeek66Harness>['gateway']['handleRequest']>>
): Record<string, unknown> => {
  if (!response.body.ok) {
    throw new Error('Expected successful API response.');
  }
  return asRecord(response.body.data);
};

const readStringField = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected string field "${key}".`);
  }
  return value;
};

describe('week 66 core API routes', () => {
  beforeEach(() => {
    // Each test uses isolated in-memory stores via fresh harness.
  });

  it('supports conversation API CRUD lifecycle with workspace scope and RBAC', async () => {
    const { gateway, authManager, workspaceManager } = buildWeek66Harness();
    const created = workspaceManager.createWorkspace({
      ownerUserId: 'owner-66',
      name: 'Week 66 Workspace',
      nowIso: '2026-02-18T00:00:00.000Z',
    });
    const workspaceId = created.workspace.id;

    const ownerKey = authManager.issueApiKey({
      ownerUserId: 'owner-66',
      label: 'owner rw',
      scope: 'read_write',
      workspaceScopes: [workspaceId],
      nowIso: '2026-02-18T00:00:00.000Z',
    });

    const createConversation = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/conversations',
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        title: 'Roadmap Review',
        personaId: 'persona-strategist',
        personaName: 'Strategist',
      },
    });

    expect(createConversation.status).toBe(201);
    expect(createConversation.body.ok).toBe(true);
    if (!createConversation.body.ok) {
      throw new Error('Conversation creation should succeed.');
    }
    const createConversationData = readSuccessData(createConversation);
    const createdConversation = asRecord(createConversationData.conversation);
    const conversationId = readStringField(createdConversation, 'id');

    const sendMessage = await gateway.handleRequest({
      method: 'POST',
      path: `/v1/conversations/${conversationId}/messages`,
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        text: 'Plan week priorities and risks',
        contextOverrides: {
          apiKey: 'test-api-key',
        },
      },
    });

    expect(sendMessage.status).toBe(201);
    expect(sendMessage.body.ok).toBe(true);
    if (!sendMessage.body.ok) {
      throw new Error('Message send should succeed.');
    }
    const sendMessageData = readSuccessData(sendMessage);
    const assistantMessage = asRecord(sendMessageData.assistantMessage);
    expect(readStringField(assistantMessage, 'text')).toContain('Strategist:');
    expect(asRecord(sendMessageData.pipeline).provider).toBe('stub-provider');

    const listMessages = await gateway.handleRequest({
      method: 'GET',
      path: `/v1/conversations/${conversationId}/messages`,
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      query: {
        limit: '1',
      },
    });

    expect(listMessages.status).toBe(200);
    expect(listMessages.body.ok).toBe(true);
    if (!listMessages.body.ok) {
      throw new Error('Message list should succeed.');
    }
    const listMessagesData = readSuccessData(listMessages);
    expect(asArray(listMessagesData.messages)).toHaveLength(1);
    expect(listMessages.body.pagination?.hasMore).toBe(true);

    const archiveConversation = await gateway.handleRequest({
      method: 'DELETE',
      path: `/v1/conversations/${conversationId}`,
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(archiveConversation.status).toBe(200);
    expect(archiveConversation.body.ok).toBe(true);

    const sendAfterArchive = await gateway.handleRequest({
      method: 'POST',
      path: `/v1/conversations/${conversationId}/messages`,
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        text: 'Should fail',
      },
    });
    expect(sendAfterArchive.status).toBe(404);
    assertErrorCode(sendAfterArchive, 'not_found');

    const viewerInvite = workspaceManager.inviteMember({
      workspaceId,
      email: 'viewer@example.com',
      role: 'viewer',
      invitedByUserId: 'owner-66',
      nowIso: '2026-02-18T00:10:00.000Z',
    });
    workspaceManager.respondToInvite({
      inviteId: viewerInvite.id,
      responderUserId: 'viewer-66',
      responderEmail: 'viewer@example.com',
      decision: 'accept',
      nowIso: '2026-02-18T00:11:00.000Z',
    });

    const viewerKey = authManager.issueApiKey({
      ownerUserId: 'viewer-66',
      label: 'viewer rw',
      scope: 'read_write',
      workspaceScopes: [workspaceId],
      nowIso: '2026-02-18T00:12:00.000Z',
    });

    const viewerCreateConversation = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/conversations',
      headers: {
        authorization: `Bearer ${viewerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        title: 'Viewer cannot create',
      },
    });
    expect(viewerCreateConversation.status).toBe(403);
    assertErrorCode(viewerCreateConversation, 'forbidden');
  });

  it('supports knowledge ingest, search, source listing, and synthesis', async () => {
    const { gateway, authManager, workspaceManager } = buildWeek66Harness();
    const created = workspaceManager.createWorkspace({
      ownerUserId: 'owner-knowledge-66',
      name: 'Knowledge Workspace',
      nowIso: '2026-02-18T01:00:00.000Z',
    });
    const workspaceId = created.workspace.id;

    const ownerKey = authManager.issueApiKey({
      ownerUserId: 'owner-knowledge-66',
      label: 'knowledge rw',
      scope: 'read_write',
      workspaceScopes: [workspaceId],
      nowIso: '2026-02-18T01:00:00.000Z',
    });

    const ingest = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/knowledge/ingest',
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        sourceType: 'note',
        title: 'Weekly loop',
        text: 'Prioritize one measurable weekly objective, then run daily execution checkpoints.',
        tags: ['weekly', 'execution'],
      },
    });

    expect(ingest.status).toBe(201);
    expect(ingest.body.ok).toBe(true);
    if (!ingest.body.ok) {
      throw new Error('Knowledge ingest should succeed.');
    }
    const ingestData = readSuccessData(ingest);
    expect(Number(ingestData.nodesIngested)).toBeGreaterThan(0);

    const search = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/knowledge/search',
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      query: {
        q: 'weekly objective checkpoints',
      },
    });
    expect(search.status).toBe(200);
    expect(search.body.ok).toBe(true);
    if (!search.body.ok) {
      throw new Error('Knowledge search should succeed.');
    }
    const searchData = readSuccessData(search);
    expect(asArray(searchData.hits).length).toBeGreaterThan(0);

    const sources = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/knowledge/sources',
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(sources.status).toBe(200);
    expect(sources.body.ok).toBe(true);
    if (!sources.body.ok) {
      throw new Error('Knowledge source list should succeed.');
    }
    const sourcesData = readSuccessData(sources);
    expect(asArray(sourcesData.sources).length).toBeGreaterThan(0);

    const synthesize = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/knowledge/synthesize',
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        query: 'How should I execute a weekly loop?',
        topK: 4,
      },
    });
    expect(synthesize.status).toBe(200);
    expect(synthesize.body.ok).toBe(true);
    if (!synthesize.body.ok) {
      throw new Error('Knowledge synthesis should succeed.');
    }
    const synthesizeData = readSuccessData(synthesize);
    const synthesis = asRecord(synthesizeData.synthesis);
    expect(readStringField(synthesis, 'answer')).toContain('Query focus');
  });

  it('supports workflow create, run, checkpoint list, resolve, and execution history', async () => {
    const { gateway, authManager, workspaceManager } = buildWeek66Harness();
    const created = workspaceManager.createWorkspace({
      ownerUserId: 'owner-workflow-66',
      name: 'Workflow Workspace',
      nowIso: '2026-02-18T02:00:00.000Z',
    });
    const workspaceId = created.workspace.id;

    const ownerKey = authManager.issueApiKey({
      ownerUserId: 'owner-workflow-66',
      label: 'workflow rw',
      scope: 'read_write',
      workspaceScopes: [workspaceId],
      nowIso: '2026-02-18T02:00:00.000Z',
    });

    const createFromPrompt = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/workflows',
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        prompt: 'Summarize my emails every morning',
      },
    });
    expect(createFromPrompt.status).toBe(201);
    expect(createFromPrompt.body.ok).toBe(true);

    const createCheckpointWorkflow = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/workflows',
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        name: 'Checkpoint Workflow',
        description: 'Workflow that pauses at checkpoint.',
        steps: [
          {
            title: 'Collect context',
            description: 'Load contextual memory',
            kind: 'transform',
            actionId: 'transform.collect_context',
            inputTemplate: '{"query":"workflow context", "topK": 3}',
          },
          {
            title: 'Human checkpoint',
            description: 'Require human approval before synthesis',
            kind: 'checkpoint',
            actionId: 'checkpoint.review',
          },
          {
            title: 'Synthesize',
            description: 'Summarize prior outputs',
            kind: 'transform',
            actionId: 'transform.summarize',
          },
          {
            title: 'Publish artifact',
            description: 'Publish final artifact',
            kind: 'artifact',
            actionId: 'artifact.publish',
          },
        ],
      },
    });
    expect(createCheckpointWorkflow.status).toBe(201);
    expect(createCheckpointWorkflow.body.ok).toBe(true);
    if (!createCheckpointWorkflow.body.ok) {
      throw new Error('Workflow creation should succeed.');
    }
    const createWorkflowData = readSuccessData(createCheckpointWorkflow);
    const workflowRecord = asRecord(createWorkflowData.workflow);
    const workflowId = readStringField(workflowRecord, 'id');

    const run = await gateway.handleRequest({
      method: 'POST',
      path: `/v1/workflows/${workflowId}/run`,
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(run.status).toBe(200);
    expect(run.body.ok).toBe(true);
    if (!run.body.ok) {
      throw new Error('Workflow run should succeed.');
    }
    const runData = readSuccessData(run);
    const runExecution = asRecord(runData.execution);
    expect(readStringField(runExecution, 'status')).toBe('checkpoint_required');

    const executionsAfterRun = await gateway.handleRequest({
      method: 'GET',
      path: `/v1/workflows/${workflowId}/executions`,
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(executionsAfterRun.status).toBe(200);
    expect(executionsAfterRun.body.ok).toBe(true);
    if (!executionsAfterRun.body.ok) {
      throw new Error('Execution list should succeed.');
    }
    const executionsAfterRunData = readSuccessData(executionsAfterRun);
    const firstExecutions = asArray(executionsAfterRunData.executions);
    expect(firstExecutions.length).toBeGreaterThanOrEqual(1);

    const checkpoints = await gateway.handleRequest({
      method: 'GET',
      path: `/v1/workflows/${workflowId}/checkpoints`,
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(checkpoints.status).toBe(200);
    expect(checkpoints.body.ok).toBe(true);
    if (!checkpoints.body.ok) {
      throw new Error('Checkpoint list should succeed.');
    }
    const checkpointsData = readSuccessData(checkpoints);
    const checkpointList = asArray(checkpointsData.checkpoints);
    const firstCheckpoint = asRecord(checkpointList[0]);
    const checkpointId = readStringField(firstCheckpoint, 'id');
    expect(checkpointId.length).toBeGreaterThan(0);

    const resolve = await gateway.handleRequest({
      method: 'POST',
      path: `/v1/workflows/${workflowId}/checkpoints/${checkpointId}/resolve`,
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        decision: 'approve',
      },
    });
    expect(resolve.status).toBe(200);
    expect(resolve.body.ok).toBe(true);
    if (!resolve.body.ok) {
      throw new Error('Checkpoint resolve should succeed.');
    }
    const resolveData = readSuccessData(resolve);
    const resolvedExecution = asRecord(resolveData.execution);
    expect(readStringField(resolvedExecution, 'status')).toBe('completed');

    const executionsAfterResolve = await gateway.handleRequest({
      method: 'GET',
      path: `/v1/workflows/${workflowId}/executions`,
      headers: {
        authorization: `Bearer ${ownerKey.apiKey}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(executionsAfterResolve.status).toBe(200);
    expect(executionsAfterResolve.body.ok).toBe(true);
    if (!executionsAfterResolve.body.ok) {
      throw new Error('Execution history should succeed.');
    }
    const executionsAfterResolveData = readSuccessData(executionsAfterResolve);
    const statuses = asArray(executionsAfterResolveData.executions).map((entry) =>
      readStringField(asRecord(entry), 'status')
    );
    expect(statuses).toContain('checkpoint_required');
    expect(statuses).toContain('completed');
  });
});
