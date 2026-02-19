import { createPipelineOrchestrator, type PipelineOrchestrator } from '@ashim/engine';
import { createGDocsConnector, createImapConnector, createNotionConnector, ConnectorRegistry, createCalendarConnector } from '../../connectors';
import { evaluateCertificationCandidate, type CertificationCandidate } from '../../certification';
import {
  ingestKnowledgeFile,
  ingestKnowledgeNote,
  ingestKnowledgeUrl,
  KnowledgeGraphStore,
  knowledgeGraphStore,
  retrieveKnowledge,
  searchKnowledgeSources,
  synthesizeKnowledgeAnswer,
} from '../../knowledge';
import {
  WorkspacePermissionMiddleware,
  type WorkspacePermission,
} from '../../team/permissions';
import { generateComplianceReport } from '../../enterprise/compliance';
import { orgAuditLog, type OrgAuditLog } from '../../enterprise/auditLog';
import { orgManager as enterpriseOrgManager, type OrgManager as EnterpriseOrgManager } from '../../enterprise/orgManager';
import { ssoManager as enterpriseSsoManager, type SSOManager as EnterpriseSSOManager } from '../../enterprise/sso/ssoManager';
import { WorkspaceConversationService } from '../../team/workspaceConversationService';
import { WorkspaceManager, workspaceManager } from '../../team/workspaceManager';
import {
  buildLinearPlanGraph,
  type Workflow,
  type WorkflowExecution,
  type WorkflowStep,
  WorkflowChangeHistory,
  WorkflowCheckpointManager,
  WorkflowEngine,
  WorkflowMemoryScope,
  WorkflowStore,
} from '../../workflows';
import { memoryConsentManager, namespaceBelongsToApp, type MemoryConsentPermissions } from '../consentManager';
import {
  ApiAnalyticsTracker,
  createApiAnalyticsMiddleware,
} from '../analytics';
import { ApiRouteError, type ApiGateway, type ApiRouteHandlerResult } from '../gateway';
import { memoryProtocol, summarizeConsolidationActions, type MemoryProtocol } from '../memoryProtocol';
import {
  ApiRateLimiter,
  createApiRateLimitMiddleware,
} from '../rateLimiter';
import { ApiCircuitBreaker, apiCircuitBreaker } from '../circuitBreaker';
import type { ApiBodyValidator, ApiRequestPrincipal, ApiValidationResult } from '../types';
import { apiWebSocketServer, type ApiWebSocketServer } from '../websocket';
import { evaluateReleaseGate, evaluateSelfHostReadiness } from '../../operations';
import { billingRuntime, type BillingRuntime, type PricingTierId } from '../../billing';
import {
  creatorPayoutManager,
  creatorRevenueLedger,
  type CreatorPayoutManager,
  type CreatorRevenueShareLedger,
} from '../../creator';
import type { Attachment } from '../../../types';

export const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

export const ensureObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

export const toArrayOfStrings = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const normalized = value.map((item) => String(item).trim()).filter((item) => item.length > 0);
  return normalized;
};

export const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export const parseLimit = (value: string | undefined, fallback: number, max: number): number => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.trunc(parsed), max));
};

export const parseCursor = (value: string | undefined): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
};

export const parseBooleanQuery = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return fallback;
};

export const parseDateQuery = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
};

export const toHealthStatus = (value: unknown): 'healthy' | 'degraded' | 'down' | null => {
  if (typeof value !== 'string') return null;
  if (value === 'healthy' || value === 'degraded' || value === 'down') return value;
  return null;
};

export const toReleaseStatus = (value: unknown): 'pass' | 'warn' | 'fail' | null => {
  if (typeof value !== 'string') return null;
  if (value === 'pass' || value === 'warn' || value === 'fail') return value;
  return null;
};

export const workspaceScopedNamespaceUserId = (
  payload: {
    ownerUserId: string;
    workspaceId: string;
    namespace: 'knowledge' | 'workflows';
  }
): string => {
  return `api:${payload.namespace}:${payload.ownerUserId}:${payload.workspaceId}`;
};

export const mapDomainErrorToRouteError = (
  error: unknown,
  fallback: { status: number; code: 'bad_request' | 'forbidden' | 'not_found'; message: string }
): ApiRouteError => {
  const message = error instanceof Error ? error.message : fallback.message;
  const lowered = message.toLowerCase();
  if (lowered.includes('not found')) {
    return new ApiRouteError({
      status: 404,
      code: 'not_found',
      message,
    });
  }
  if (lowered.includes('not part of conversation') || lowered.includes('not a member')) {
    return new ApiRouteError({
      status: 403,
      code: 'forbidden',
      message,
    });
  }
  if (lowered.includes('permission') || lowered.includes('insufficient role')) {
    return new ApiRouteError({
      status: 403,
      code: 'forbidden',
      message,
    });
  }
  return new ApiRouteError({
    status: fallback.status,
    code: fallback.code,
    message,
  });
};

export const requirePrincipal = (
  principal: ApiRequestPrincipal | null
): ApiRequestPrincipal => {
  if (!principal) {
    throw new ApiRouteError({
      status: 401,
      code: 'unauthorized',
      message: 'Authenticated principal is required.',
    });
  }
  return principal;
};

export const requireWorkspaceId = (workspaceId: string | null): string => {
  if (!workspaceId) {
    throw new ApiRouteError({
      status: 400,
      code: 'bad_request',
      message: 'x-workspace-id header is required.',
    });
  }
  return workspaceId;
};

interface ApiConversationMetadata {
  conversationId: string;
  workspaceId: string;
  personaId?: string;
  personaName?: string;
  archivedAtIso?: string;
}

export class ApiConversationRuntime {
  private readonly metadataByConversationId = new Map<string, ApiConversationMetadata>();

  setMetadata(payload: ApiConversationMetadata): void {
    this.metadataByConversationId.set(payload.conversationId, payload);
  }

  getMetadata(conversationId: string): ApiConversationMetadata | null {
    return this.metadataByConversationId.get(conversationId) ?? null;
  }

  archive(conversationId: string, archivedAtIso: string): ApiConversationMetadata | null {
    const metadata = this.metadataByConversationId.get(conversationId);
    if (!metadata) return null;
    const next = {
      ...metadata,
      archivedAtIso,
    };
    this.metadataByConversationId.set(conversationId, next);
    return next;
  }
}

export interface CoreApiRouteServices {
  workspaceManager: WorkspaceManager;
  workspacePermissionMiddleware: WorkspacePermissionMiddleware;
  conversationService: WorkspaceConversationService;
  conversationRuntime: ApiConversationRuntime;
  knowledgeStore: KnowledgeGraphStore;
  workflowEngine: WorkflowEngine;
  memoryProtocol: MemoryProtocol;
  consentManager: typeof memoryConsentManager;
  pipelineOrchestrator: PipelineOrchestrator;
  websocketServer: ApiWebSocketServer;
  rateLimiter: ApiRateLimiter;
  circuitBreaker: ApiCircuitBreaker;
  apiAnalytics: ApiAnalyticsTracker;
  enterpriseOrgManager: Pick<
    EnterpriseOrgManager,
    'getOrganization' | 'isOrgAdmin' | 'listOrgWorkspaceIds' | 'listOrgAdmins'
  >;
  enterpriseAuditLog: Pick<
    OrgAuditLog,
    'append' | 'listEntries' | 'listEntriesAscending' | 'validateChain'
  >;
  enterpriseSsoManager: Pick<EnterpriseSSOManager, 'listProviders' | 'configureProvider'>;
  billingRuntime: BillingRuntime;
  creatorRevenueLedger: CreatorRevenueShareLedger;
  creatorPayoutManager: CreatorPayoutManager;
}

const createDefaultWorkflowEngine = (): WorkflowEngine => {
  const registry = new ConnectorRegistry();
  registry.register(createImapConnector());
  registry.register(createNotionConnector());
  registry.register(createCalendarConnector());
  registry.register(createGDocsConnector());

  return new WorkflowEngine({
    store: new WorkflowStore(),
    registry,
    memoryScope: new WorkflowMemoryScope(),
    checkpointManager: new WorkflowCheckpointManager(),
    changeHistory: new WorkflowChangeHistory(),
  });
};

const defaultWorkspacePermissionMiddleware = new WorkspacePermissionMiddleware({
  resolveActorRole: ({ workspaceId, userId }) =>
    workspaceManager.getMemberRole(workspaceId, userId),
  resolveWorkspaceOwnerUserId: (workspaceId) =>
    workspaceManager.getWorkspace(workspaceId)?.createdByUserId ?? null,
});

const defaultConversationService = new WorkspaceConversationService({
  resolveMemberRole: ({ workspaceId, userId }) =>
    workspaceManager.getMemberRole(workspaceId, userId),
  resolveWorkspaceOwnerUserId: (workspaceId) =>
    workspaceManager.getWorkspace(workspaceId)?.createdByUserId ?? null,
});

const defaultRouteServices: CoreApiRouteServices = {
  workspaceManager,
  workspacePermissionMiddleware: defaultWorkspacePermissionMiddleware,
  conversationService: defaultConversationService,
  conversationRuntime: new ApiConversationRuntime(),
  knowledgeStore: knowledgeGraphStore,
  workflowEngine: createDefaultWorkflowEngine(),
  memoryProtocol,
  consentManager: memoryConsentManager,
  pipelineOrchestrator: createPipelineOrchestrator(),
  websocketServer: apiWebSocketServer,
  rateLimiter: new ApiRateLimiter({
    limitPerMinute: 120,
  }),
  circuitBreaker: apiCircuitBreaker,
  apiAnalytics: new ApiAnalyticsTracker(),
  enterpriseOrgManager,
  enterpriseAuditLog: orgAuditLog,
  enterpriseSsoManager: enterpriseSsoManager,
  billingRuntime,
  creatorRevenueLedger,
  creatorPayoutManager,
};

export const createCoreApiRouteServices = (
  overrides: Partial<CoreApiRouteServices> = {}
): CoreApiRouteServices => ({
  ...defaultRouteServices,
  ...overrides,
});

const analyticsMiddlewareGateways = new WeakSet<ApiGateway>();
const rateLimitMiddlewareGateways = new WeakSet<ApiGateway>();

export const requireWorkspacePermission = async (payload: {
  middleware: WorkspacePermissionMiddleware;
  workspaceId: string;
  actorUserId: string;
  action: WorkspacePermission;
}): Promise<void> => {
  try {
    await payload.middleware.require({
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      action: payload.action,
    });
  } catch (error) {
    throw mapDomainErrorToRouteError(error, {
      status: 403,
      code: 'forbidden',
      message: 'Workspace permission denied.',
    });
  }
};

export const requireOrgAdmin = (
  services: CoreApiRouteServices,
  organizationId: string,
  actorUserId: string
) => {
  const organization = services.enterpriseOrgManager.getOrganization(organizationId);
  if (!organization) {
    throw new ApiRouteError({
      status: 404,
      code: 'not_found',
      message: `Organization ${organizationId} not found.`,
    });
  }

  if (!services.enterpriseOrgManager.isOrgAdmin(organizationId, actorUserId)) {
    throw new ApiRouteError({
      status: 403,
      code: 'forbidden',
      message: `User ${actorUserId} is not an org admin for ${organizationId}.`,
    });
  }

  return organization;
};

interface CreateConversationBody {
  title?: string;
  personaId?: string;
  personaName?: string;
  participantUserIds?: string[];
}

export const validateCreateConversationBody: ApiBodyValidator<CreateConversationBody> = (
  body
): ApiValidationResult<CreateConversationBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  const participants = input.participantUserIds
    ? toArrayOfStrings(input.participantUserIds)
    : undefined;
  if (input.participantUserIds && !participants) {
    return {
      ok: false,
      issues: ['participantUserIds must be an array of strings.'],
    };
  }

  return {
    ok: true,
    data: {
      title: toOptionalString(input.title),
      personaId: toOptionalString(input.personaId),
      personaName: toOptionalString(input.personaName),
      participantUserIds: participants,
    },
  };
};

interface SendMessageBody {
  text?: string;
  attachments?: Attachment[];
  contextOverrides?: {
    provider?: string;
    model?: string;
    apiKey?: string;
    temperature?: number;
    timestamp?: number;
  };
}

export const validateSendMessageBody: ApiBodyValidator<SendMessageBody> = (
  body
): ApiValidationResult<SendMessageBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  const text = toOptionalString(input.text);

  let attachments: Attachment[] | undefined;
  if (input.attachments !== undefined) {
    if (!Array.isArray(input.attachments)) {
      return {
        ok: false,
        issues: ['attachments must be an array when provided.'],
      };
    }

    attachments = [];
    for (const [index, raw] of input.attachments.entries()) {
      const record = ensureObject(raw);
      if (!record) {
        return {
          ok: false,
          issues: [`attachments[${index}] must be an object.`],
        };
      }

      const type = toOptionalString(record.type);
      if (!type || !['image', 'video', 'file', 'audio'].includes(type)) {
        return {
          ok: false,
          issues: [`attachments[${index}].type must be image|video|file|audio.`],
        };
      }

      const mimeType = toOptionalString(record.mimeType);
      const url = toOptionalString(record.url);
      if (!mimeType || !url) {
        return {
          ok: false,
          issues: [`attachments[${index}] requires mimeType and url.`],
        };
      }

      attachments.push({
        id: toOptionalString(record.id) ?? makeId('attachment'),
        type: type as Attachment['type'],
        mimeType,
        url,
        data: toOptionalString(record.data),
      });
    }
  }

  const contextOverridesInput = ensureObject(input.contextOverrides);
  const temperatureRaw = contextOverridesInput?.temperature;
  const timestampRaw = contextOverridesInput?.timestamp;

  if (!text && (!attachments || attachments.length === 0)) {
    return {
      ok: false,
      issues: ['Either text or attachments is required.'],
    };
  }

  return {
    ok: true,
    data: {
      text,
      attachments,
      contextOverrides: contextOverridesInput
        ? {
            provider: toOptionalString(contextOverridesInput.provider),
            model: toOptionalString(contextOverridesInput.model),
            apiKey: toOptionalString(contextOverridesInput.apiKey),
            temperature:
              typeof temperatureRaw === 'number' && Number.isFinite(temperatureRaw)
                ? temperatureRaw
                : undefined,
            timestamp:
              typeof timestampRaw === 'number' && Number.isFinite(timestampRaw)
                ? Math.trunc(timestampRaw)
                : undefined,
          }
        : undefined,
    },
  };
};

export const resolveConversationApiKey = async (overrideApiKey?: string): Promise<string | null> => {
  const override = overrideApiKey?.trim();
  if (override) return override;

  try {
    const runtimeKeyModule = await import('../../byok/runtimeKey');
    const runtimeKey = runtimeKeyModule.getRuntimeGeminiKey()?.trim();
    if (runtimeKey) return runtimeKey;
  } catch {
    // Optional runtime helper may be unavailable in some environments.
  }

  try {
    const keyManagerModule = await import('../../byok/keyManager');
    const decrypted = await keyManagerModule.BYOKKeyManager.getDecryptedKey('gemini');
    const normalized = decrypted?.trim();
    if (normalized) return normalized;
  } catch {
    // Ignore unavailable key manager and continue with null.
  }

  return null;
};

interface KnowledgeIngestBody {
  sourceType: 'note' | 'file' | 'url';
  title?: string;
  text?: string;
  url?: string;
  mimeType?: string;
  tags?: string[];
}

export const validateKnowledgeIngestBody: ApiBodyValidator<KnowledgeIngestBody> = (
  body
): ApiValidationResult<KnowledgeIngestBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  const sourceType = toOptionalString(input.sourceType) as KnowledgeIngestBody['sourceType'] | undefined;
  if (!sourceType || !['note', 'file', 'url'].includes(sourceType)) {
    return {
      ok: false,
      issues: ['sourceType must be one of: note, file, url.'],
    };
  }

  const text = toOptionalString(input.text);
  const url = toOptionalString(input.url);
  if ((sourceType === 'note' || sourceType === 'file') && !text) {
    return {
      ok: false,
      issues: ['text is required for note/file ingest.'],
    };
  }
  if (sourceType === 'url' && !url) {
    return {
      ok: false,
      issues: ['url is required for url ingest.'],
    };
  }

  const tags = input.tags ? toArrayOfStrings(input.tags) : undefined;
  if (input.tags && !tags) {
    return {
      ok: false,
      issues: ['tags must be an array of strings.'],
    };
  }

  return {
    ok: true,
    data: {
      sourceType,
      title: toOptionalString(input.title),
      text,
      url,
      mimeType: toOptionalString(input.mimeType),
      tags,
    },
  };
};

interface KnowledgeSynthesizeBody {
  query: string;
  topK?: number;
}

export const validateKnowledgeSynthesizeBody: ApiBodyValidator<KnowledgeSynthesizeBody> = (
  body
): ApiValidationResult<KnowledgeSynthesizeBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }
  const query = toOptionalString(input.query);
  if (!query) {
    return {
      ok: false,
      issues: ['query is required.'],
    };
  }
  const topKRaw = input.topK;
  const topK = typeof topKRaw === 'number' && Number.isFinite(topKRaw) ? Math.max(1, Math.min(20, Math.trunc(topKRaw))) : undefined;

  return {
    ok: true,
    data: {
      query,
      topK,
    },
  };
};

interface MemoryConsentGrantBody {
  appId: string;
  namespaces: string[];
  permissions?: Partial<MemoryConsentPermissions>;
}

export const validateMemoryConsentGrantBody: ApiBodyValidator<MemoryConsentGrantBody> = (
  body
): ApiValidationResult<MemoryConsentGrantBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  const appId = toOptionalString(input.appId);
  const namespaces = toArrayOfStrings(input.namespaces);
  if (!appId) {
    return {
      ok: false,
      issues: ['appId is required.'],
    };
  }
  if (!namespaces || namespaces.length === 0) {
    return {
      ok: false,
      issues: ['namespaces must be a non-empty array of strings.'],
    };
  }

  const permissionsInput = ensureObject(input.permissions);
  const permissions: Partial<MemoryConsentPermissions> | undefined = permissionsInput
    ? {
        read:
          typeof permissionsInput.read === 'boolean' ? permissionsInput.read : undefined,
        write:
          typeof permissionsInput.write === 'boolean' ? permissionsInput.write : undefined,
        consolidate:
          typeof permissionsInput.consolidate === 'boolean'
            ? permissionsInput.consolidate
            : undefined,
      }
    : undefined;

  return {
    ok: true,
    data: {
      appId,
      namespaces,
      permissions,
    },
  };
};

interface MemoryConsentRevokeBody {
  appId: string;
  namespace?: string;
}

export const validateMemoryConsentRevokeBody: ApiBodyValidator<MemoryConsentRevokeBody> = (
  body
): ApiValidationResult<MemoryConsentRevokeBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  const appId = toOptionalString(input.appId);
  if (!appId) {
    return {
      ok: false,
      issues: ['appId is required.'],
    };
  }

  return {
    ok: true,
    data: {
      appId,
      namespace: toOptionalString(input.namespace),
    },
  };
};

interface MemoryWriteBody {
  appId: string;
  namespace: string;
  content: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  emotionalValence?: number;
  decayFactor?: number;
}

export const validateMemoryWriteBody: ApiBodyValidator<MemoryWriteBody> = (
  body
): ApiValidationResult<MemoryWriteBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  const appId = toOptionalString(input.appId);
  const namespace = toOptionalString(input.namespace);
  const content = toOptionalString(input.content);
  if (!appId) {
    return {
      ok: false,
      issues: ['appId is required.'],
    };
  }
  if (!namespace) {
    return {
      ok: false,
      issues: ['namespace is required.'],
    };
  }
  if (!content) {
    return {
      ok: false,
      issues: ['content is required.'],
    };
  }

  const tags = input.tags ? toArrayOfStrings(input.tags) : undefined;
  if (input.tags && !tags) {
    return {
      ok: false,
      issues: ['tags must be an array of strings.'],
    };
  }
  const metadata = ensureObject(input.metadata) ?? undefined;

  const emotionalValence =
    typeof input.emotionalValence === 'number' && Number.isFinite(input.emotionalValence)
      ? input.emotionalValence
      : undefined;
  const decayFactor =
    typeof input.decayFactor === 'number' && Number.isFinite(input.decayFactor)
      ? input.decayFactor
      : undefined;

  return {
    ok: true,
    data: {
      appId,
      namespace,
      content,
      tags,
      metadata,
      emotionalValence,
      decayFactor,
    },
  };
};

interface MemoryConsolidateBody {
  namespaces?: string[];
  dryRun?: boolean;
}

export const validateMemoryConsolidateBody: ApiBodyValidator<MemoryConsolidateBody> = (
  body
): ApiValidationResult<MemoryConsolidateBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  const namespaces = input.namespaces ? toArrayOfStrings(input.namespaces) : undefined;
  if (input.namespaces && !namespaces) {
    return {
      ok: false,
      issues: ['namespaces must be an array of strings.'],
    };
  }

  const dryRun = typeof input.dryRun === 'boolean' ? input.dryRun : undefined;

  return {
    ok: true,
    data: {
      namespaces,
      dryRun,
    },
  };
};

interface PipelineRunBody {
  appId?: string;
  threadId?: string;
  personaId?: string;
  message: string;
  contextOverrides?: {
    provider?: string;
    model?: string;
    apiKey?: string;
    temperature?: number;
    timestamp?: number;
  };
  persona?: {
    id?: string;
    name?: string;
    systemInstruction?: string;
    compiledPrompt?: string;
    emotionalDebt?: number;
    attachmentStyle?: 'secure' | 'anxious' | 'avoidant' | 'disorganized';
  };
  stream?: {
    enabled?: boolean;
    connectionId?: string;
  };
}

export const validatePipelineRunBody: ApiBodyValidator<PipelineRunBody> = (
  body
): ApiValidationResult<PipelineRunBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  const message = toOptionalString(input.message);
  if (!message) {
    return {
      ok: false,
      issues: ['message is required.'],
    };
  }

  const contextOverridesInput = ensureObject(input.contextOverrides);
  const personaInput = ensureObject(input.persona);
  const streamInput = ensureObject(input.stream);
  const temperatureRaw = contextOverridesInput?.temperature;
  const timestampRaw = contextOverridesInput?.timestamp;

  return {
    ok: true,
    data: {
      appId: toOptionalString(input.appId),
      threadId: toOptionalString(input.threadId),
      personaId: toOptionalString(input.personaId),
      message,
      contextOverrides: contextOverridesInput
        ? {
            provider: toOptionalString(contextOverridesInput.provider),
            model: toOptionalString(contextOverridesInput.model),
            apiKey: toOptionalString(contextOverridesInput.apiKey),
            temperature:
              typeof temperatureRaw === 'number' && Number.isFinite(temperatureRaw)
                ? temperatureRaw
                : undefined,
            timestamp:
              typeof timestampRaw === 'number' && Number.isFinite(timestampRaw)
                ? Math.trunc(timestampRaw)
                : undefined,
          }
        : undefined,
      persona: personaInput
        ? {
            id: toOptionalString(personaInput.id),
            name: toOptionalString(personaInput.name),
            systemInstruction: toOptionalString(personaInput.systemInstruction),
            compiledPrompt: toOptionalString(personaInput.compiledPrompt),
            emotionalDebt:
              typeof personaInput.emotionalDebt === 'number' &&
              Number.isFinite(personaInput.emotionalDebt)
                ? personaInput.emotionalDebt
                : undefined,
            attachmentStyle:
              (toOptionalString(personaInput.attachmentStyle) as
                | 'secure'
                | 'anxious'
                | 'avoidant'
                | 'disorganized'
                | undefined) ?? undefined,
          }
        : undefined,
      stream: streamInput
        ? {
            enabled:
              typeof streamInput.enabled === 'boolean' ? streamInput.enabled : undefined,
            connectionId: toOptionalString(streamInput.connectionId),
          }
        : undefined,
    },
  };
};

interface WorkflowStepInput {
  id?: string;
  title: string;
  description?: string;
  kind: WorkflowStep['kind'];
  actionId: string;
  inputTemplate?: string;
}

interface WorkflowTriggerInput {
  type?: Workflow['trigger']['type'];
  enabled?: boolean;
  schedule?: {
    intervalMinutes?: number;
    nextRunAtIso?: string;
    cronLike?: string;
  };
  event?: {
    eventType?: 'new_message' | 'keyword_match';
    keyword?: string;
  };
}

interface WorkflowCreateBody {
  prompt?: string;
  name?: string;
  description?: string;
  steps?: WorkflowStepInput[];
  trigger?: WorkflowTriggerInput;
}

const normalizeWorkflowStep = (step: WorkflowStepInput, index: number): WorkflowStep => {
  return {
    id: toOptionalString(step.id) ?? makeId('step'),
    title: toOptionalString(step.title) ?? `Step ${index + 1}`,
    description: toOptionalString(step.description) ?? `Workflow step ${index + 1}`,
    kind: step.kind,
    actionId: toOptionalString(step.actionId) ?? `transform.step_${index + 1}`,
    inputTemplate: toOptionalString(step.inputTemplate),
    status: 'idle',
  };
};

const normalizeWorkflowTrigger = (
  trigger: WorkflowTriggerInput | undefined,
  nowIso: string
): Workflow['trigger'] => {
  const type = trigger?.type ?? 'manual';
  const enabled = trigger?.enabled ?? true;

  if (type === 'schedule') {
    const intervalMinutes = Math.max(1, Math.trunc(trigger?.schedule?.intervalMinutes ?? 60));
    const nextRunAtIso =
      toOptionalString(trigger?.schedule?.nextRunAtIso) ??
      new Date(Date.parse(nowIso) + intervalMinutes * 60 * 1000).toISOString();
    return {
      id: makeId('trigger'),
      type,
      enabled,
      schedule: {
        intervalMinutes,
        nextRunAtIso,
        cronLike: toOptionalString(trigger?.schedule?.cronLike) ?? 'INTERVAL',
      },
    };
  }

  if (type === 'event') {
    return {
      id: makeId('trigger'),
      type,
      enabled,
      event: {
        eventType: trigger?.event?.eventType ?? 'new_message',
        keyword: toOptionalString(trigger?.event?.keyword),
      },
    };
  }

  return {
    id: makeId('trigger'),
    type: 'manual',
    enabled,
  };
};

export const validateWorkflowCreateBody: ApiBodyValidator<WorkflowCreateBody> = (
  body
): ApiValidationResult<WorkflowCreateBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  const prompt = toOptionalString(input.prompt);
  const name = toOptionalString(input.name);
  const description = toOptionalString(input.description);
  const trigger = ensureObject(input.trigger) as WorkflowTriggerInput | null;

  const stepsRaw = input.steps;
  let steps: WorkflowStepInput[] | undefined;
  if (stepsRaw !== undefined) {
    if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
      return {
        ok: false,
        issues: ['steps must be a non-empty array when provided.'],
      };
    }

    const normalizedSteps: WorkflowStepInput[] = [];
    for (const item of stepsRaw) {
      const step = ensureObject(item);
      if (!step) {
        return {
          ok: false,
          issues: ['Each step must be an object.'],
        };
      }

      const kind = toOptionalString(step.kind);
      const actionId = toOptionalString(step.actionId);
      const title = toOptionalString(step.title);
      if (!kind || !['connector', 'transform', 'artifact', 'checkpoint'].includes(kind)) {
        return {
          ok: false,
          issues: ['Each step.kind must be one of connector|transform|artifact|checkpoint.'],
        };
      }
      if (!actionId) {
        return {
          ok: false,
          issues: ['Each step requires actionId.'],
        };
      }
      if (!title) {
        return {
          ok: false,
          issues: ['Each step requires title.'],
        };
      }
      normalizedSteps.push({
        id: toOptionalString(step.id),
        title,
        description: toOptionalString(step.description),
        kind: kind as WorkflowStep['kind'],
        actionId,
        inputTemplate: toOptionalString(step.inputTemplate),
      });
    }
    steps = normalizedSteps;
  }

  if (!prompt && (!steps || steps.length === 0)) {
    return {
      ok: false,
      issues: ['Either prompt or steps is required.'],
    };
  }

  return {
    ok: true,
    data: {
      prompt,
      name,
      description,
      steps,
      trigger: trigger ?? undefined,
    },
  };
};

interface WorkflowResolveCheckpointBody {
  decision: 'approve' | 'reject' | 'edit';
  rejectionReason?: string;
  editedAction?: {
    title?: string;
    description?: string;
    actionId?: string;
    inputTemplate?: string;
  };
}

export const validateWorkflowResolveCheckpointBody: ApiBodyValidator<WorkflowResolveCheckpointBody> = (
  body
): ApiValidationResult<WorkflowResolveCheckpointBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  const decision = toOptionalString(input.decision) as WorkflowResolveCheckpointBody['decision'] | undefined;
  if (!decision || !['approve', 'reject', 'edit'].includes(decision)) {
    return {
      ok: false,
      issues: ['decision must be one of approve|reject|edit.'],
    };
  }

  const editedActionInput = ensureObject(input.editedAction);

  return {
    ok: true,
    data: {
      decision,
      rejectionReason: toOptionalString(input.rejectionReason),
      editedAction: editedActionInput
        ? {
            title: toOptionalString(editedActionInput.title),
            description: toOptionalString(editedActionInput.description),
            actionId: toOptionalString(editedActionInput.actionId),
            inputTemplate: toOptionalString(editedActionInput.inputTemplate),
          }
        : undefined,
    },
  };
};

export const buildWorkflowFromApiDefinition = (payload: {
  actorScopedUserId: string;
  nowIso: string;
  body: WorkflowCreateBody;
}): Workflow => {
  const steps = (payload.body.steps ?? []).map(normalizeWorkflowStep);
  return {
    id: makeId('workflow'),
    userId: payload.actorScopedUserId,
    name: payload.body.name ?? payload.body.prompt ?? 'API Workflow',
    description: payload.body.description ?? 'Workflow created through API route.',
    naturalLanguagePrompt: payload.body.prompt ?? payload.body.name ?? 'API workflow',
    trigger: normalizeWorkflowTrigger(payload.body.trigger, payload.nowIso),
    steps,
    planGraph: buildLinearPlanGraph(steps),
    status: 'ready',
    createdAtIso: payload.nowIso,
    updatedAtIso: payload.nowIso,
  };
};

interface AdminConfigureSsoBody {
  type: 'saml' | 'oidc';
  name: string;
  enabled?: boolean;
  saml?: {
    entityId: string;
    ssoUrl: string;
    x509Certificate: string;
    audience?: string;
  };
  oidc?: {
    issuer: string;
    clientId: string;
    audience?: string;
    clientSecret?: string;
  };
}

export const validateAdminConfigureSsoBody: ApiBodyValidator<AdminConfigureSsoBody> = (
  body
): ApiValidationResult<AdminConfigureSsoBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  const type = toOptionalString(input.type);
  const name = toOptionalString(input.name);
  if (!type || !['saml', 'oidc'].includes(type)) {
    return {
      ok: false,
      issues: ['type must be saml or oidc.'],
    };
  }
  if (!name) {
    return {
      ok: false,
      issues: ['name is required.'],
    };
  }

  const samlInput = ensureObject(input.saml);
  const oidcInput = ensureObject(input.oidc);
  if (type === 'saml') {
    if (!samlInput) {
      return {
        ok: false,
        issues: ['saml config is required for saml provider.'],
      };
    }
    if (!toOptionalString(samlInput.entityId) || !toOptionalString(samlInput.ssoUrl) || !toOptionalString(samlInput.x509Certificate)) {
      return {
        ok: false,
        issues: ['saml.entityId, saml.ssoUrl, and saml.x509Certificate are required.'],
      };
    }
  }
  if (type === 'oidc') {
    if (!oidcInput) {
      return {
        ok: false,
        issues: ['oidc config is required for oidc provider.'],
      };
    }
    if (!toOptionalString(oidcInput.issuer) || !toOptionalString(oidcInput.clientId)) {
      return {
        ok: false,
        issues: ['oidc.issuer and oidc.clientId are required.'],
      };
    }
  }

  return {
    ok: true,
    data: {
      type: type as 'saml' | 'oidc',
      name,
      enabled: typeof input.enabled === 'boolean' ? input.enabled : undefined,
      saml: samlInput
        ? {
            entityId: toOptionalString(samlInput.entityId) ?? '',
            ssoUrl: toOptionalString(samlInput.ssoUrl) ?? '',
            x509Certificate: toOptionalString(samlInput.x509Certificate) ?? '',
            audience: toOptionalString(samlInput.audience),
          }
        : undefined,
      oidc: oidcInput
        ? {
            issuer: toOptionalString(oidcInput.issuer) ?? '',
            clientId: toOptionalString(oidcInput.clientId) ?? '',
            audience: toOptionalString(oidcInput.audience),
            clientSecret: toOptionalString(oidcInput.clientSecret),
          }
        : undefined,
    },
  };
};

interface BillingChangeTierBody {
  tierId: PricingTierId;
  effectiveAtIso?: string;
}

export const validateBillingChangeTierBody: ApiBodyValidator<BillingChangeTierBody> = (
  body
): ApiValidationResult<BillingChangeTierBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  const tierId = toOptionalString(input.tierId);
  if (!tierId || !['free', 'pro', 'team', 'enterprise'].includes(tierId)) {
    return {
      ok: false,
      issues: ['tierId must be one of free|pro|team|enterprise.'],
    };
  }
  const effectiveAtIso = toOptionalString(input.effectiveAtIso);

  return {
    ok: true,
    data: {
      tierId: tierId as PricingTierId,
      effectiveAtIso,
    },
  };
};

interface AdminBillingBudgetBody {
  workspaceId: string;
  thresholdUsd: number;
}

export const validateAdminBillingBudgetBody: ApiBodyValidator<AdminBillingBudgetBody> = (
  body
): ApiValidationResult<AdminBillingBudgetBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  const workspaceId = toOptionalString(input.workspaceId);
  const thresholdUsd =
    typeof input.thresholdUsd === 'number' && Number.isFinite(input.thresholdUsd)
      ? input.thresholdUsd
      : NaN;

  if (!workspaceId) {
    return {
      ok: false,
      issues: ['workspaceId is required.'],
    };
  }
  if (!Number.isFinite(thresholdUsd) || thresholdUsd <= 0) {
    return {
      ok: false,
      issues: ['thresholdUsd must be a positive number.'],
    };
  }

  return {
    ok: true,
    data: {
      workspaceId,
      thresholdUsd,
    },
  };
};

export const withPagination = <T>(
  items: ReadonlyArray<T>,
  cursor: number,
  limit: number
): { items: T[]; nextCursor: string | null; hasMore: boolean } => {
  const start = Math.min(cursor, items.length);
  const end = Math.min(start + limit, items.length);
  return {
    items: items.slice(start, end),
    nextCursor: end < items.length ? String(end) : null,
    hasMore: end < items.length,
  };
};

export const serializeExecution = (execution: WorkflowExecution) => ({
  id: execution.id,
  workflowId: execution.workflowId,
  status: execution.status,
  triggerType: execution.triggerType,
  startedAtIso: execution.startedAtIso,
  finishedAtIso: execution.finishedAtIso,
  durationMs: execution.durationMs,
  stepCount: execution.stepResults.length,
  memoryNamespace: execution.memoryNamespace,
  inboxArtifactId: execution.inboxArtifactId ?? null,
});

export const errorResult = (
  payload: {
    status: number;
    code: 'bad_request' | 'forbidden' | 'not_found';
    message: string;
  }
): ApiRouteHandlerResult => {
  throw new ApiRouteError({
    status: payload.status,
    code: payload.code,
    message: payload.message,
  });
};
