import { namespaceBelongsToApp } from '../consentManager';
import { summarizeConsolidationActions } from '../memoryProtocol';
import type { ApiGateway } from '../gateway';
import {
  type CoreApiRouteServices,
  errorResult,
  mapDomainErrorToRouteError,
  parseBooleanQuery,
  parseLimit,
  requirePrincipal,
  requireWorkspaceId,
  requireWorkspacePermission,
  toOptionalString,
  validateMemoryConsolidateBody,
  validateMemoryConsentGrantBody,
  validateMemoryConsentRevokeBody,
  validateMemoryWriteBody,
} from './shared';

export const registerMemoryRoutes = (
  gateway: ApiGateway,
  services: CoreApiRouteServices
): void => {
  gateway.registerRoute({
    method: 'GET',
    path: '/v1/memory/consents',
    meta: {
      name: 'memory.consents.list',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'memory:read',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.memory.read',
      });

      const consents = services.consentManager.listForWorkspace({
        userId: principal.ownerUserId,
        workspaceId,
        includeRevoked: parseBooleanQuery(context.request.query.includeRevoked),
      });
      const namespaceStats = services.memoryProtocol.listNamespaceStats({
        userId: principal.ownerUserId,
        workspaceId,
      });

      return {
        data: {
          consents,
          namespaceStats,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/memory/consents/grant',
    meta: {
      name: 'memory.consents.grant',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'memory:admin',
    },
    validateBody: validateMemoryConsentGrantBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.memory.consolidate',
      });

      const consent = services.consentManager.grant({
        userId: principal.ownerUserId,
        workspaceId,
        appId: context.request.body.appId,
        namespaces: context.request.body.namespaces,
        permissions: context.request.body.permissions,
        grantedByUserId: principal.ownerUserId,
        nowIso: context.nowIso,
      });

      return {
        status: 201,
        data: {
          consent,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/memory/consents/revoke',
    meta: {
      name: 'memory.consents.revoke',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'memory:admin',
    },
    validateBody: validateMemoryConsentRevokeBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.memory.consolidate',
      });

      const consent = services.consentManager.revoke({
        userId: principal.ownerUserId,
        workspaceId,
        appId: context.request.body.appId,
        namespace: context.request.body.namespace,
        revokedByUserId: principal.ownerUserId,
        nowIso: context.nowIso,
      });

      return {
        data: {
          consent,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/memory/write',
    meta: {
      name: 'memory.write',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'memory:write',
    },
    validateBody: validateMemoryWriteBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.memory.write',
      });

      const appId = context.request.body.appId.trim().toLowerCase();
      const namespace = context.request.body.namespace.trim().toLowerCase();
      if (!namespaceBelongsToApp(appId, namespace)) {
        return errorResult({
          status: 400,
          code: 'bad_request',
          message: `Namespace ${namespace} does not belong to app ${appId}.`,
        });
      }

      try {
        services.consentManager.assertAccess({
          userId: principal.ownerUserId,
          workspaceId,
          appId,
          namespace,
          operation: 'write',
        });
      } catch (error) {
        throw mapDomainErrorToRouteError(error, {
          status: 403,
          code: 'forbidden',
          message: 'Memory write consent denied.',
        });
      }

      const entry = services.memoryProtocol.write({
        userId: principal.ownerUserId,
        workspaceId,
        appId,
        namespace,
        content: context.request.body.content,
        tags: context.request.body.tags,
        metadata: context.request.body.metadata,
        emotionalValence: context.request.body.emotionalValence,
        decayFactor: context.request.body.decayFactor,
        nowIso: context.nowIso,
      });
      services.consentManager.recordUsage({
        userId: principal.ownerUserId,
        workspaceId,
        appId,
        operation: 'write',
        nowIso: context.nowIso,
      });

      return {
        status: 201,
        data: {
          entry,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'GET',
    path: '/v1/memory/recall',
    meta: {
      name: 'memory.recall',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'memory:read',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.memory.read',
      });

      const query = toOptionalString(context.request.query.q);
      if (!query) {
        return errorResult({
          status: 400,
          code: 'bad_request',
          message: 'q query parameter is required.',
        });
      }

      const appId = toOptionalString(context.request.query.appId)?.toLowerCase();
      const namespaceQuery = toOptionalString(context.request.query.namespace);
      const topK = parseLimit(context.request.query.topK, 8, 30);
      const requestedNamespaces = namespaceQuery
        ? namespaceQuery
            .split(',')
            .map((value) => value.trim().toLowerCase())
            .filter((value) => value.length > 0 && value !== '*' && value !== 'all')
        : [];

      const allReadableNamespaces = services.consentManager
        .listForWorkspace({
          userId: principal.ownerUserId,
          workspaceId,
        })
        .filter((consent) => consent.permissions.read)
        .flatMap((consent) => consent.namespaces);

      const allowedNamespaceSet = new Set(allReadableNamespaces);
      let namespaces: string[] | undefined;

      if (requestedNamespaces.length > 0) {
        namespaces = requestedNamespaces;
      } else if (appId) {
        const consent = services.consentManager.getActiveConsent({
          userId: principal.ownerUserId,
          workspaceId,
          appId,
        });
        namespaces = consent?.permissions.read ? consent.namespaces : [];
      } else {
        namespaces = allReadableNamespaces;
      }

      if (!namespaces || namespaces.length === 0) {
        return {
          data: {
            query,
            hits: [],
            scannedMemoryCount: 0,
            generatedAtIso: context.nowIso,
            formula: 'semantic(0.4)+recency(0.3)+emotional(0.2)+frequency(0.1)',
          },
        };
      }

      for (const namespace of namespaces) {
        if (appId) {
          try {
            services.consentManager.assertAccess({
              userId: principal.ownerUserId,
              workspaceId,
              appId,
              namespace,
              operation: 'read',
            });
          } catch (error) {
            throw mapDomainErrorToRouteError(error, {
              status: 403,
              code: 'forbidden',
              message: 'Memory recall consent denied.',
            });
          }
          continue;
        }
        if (!allowedNamespaceSet.has(namespace)) {
          return errorResult({
            status: 403,
            code: 'forbidden',
            message: `Namespace ${namespace} is not authorized for recall.`,
          });
        }
      }

      const recall = await services.memoryProtocol.recall({
        userId: principal.ownerUserId,
        workspaceId,
        query,
        namespaces,
        topK,
        nowIso: context.nowIso,
      });

      if (appId) {
        services.consentManager.recordUsage({
          userId: principal.ownerUserId,
          workspaceId,
          appId,
          operation: 'read',
          nowIso: context.nowIso,
        });
      }

      return {
        data: {
          ...recall,
          hits: recall.hits.map((hit) => ({
            score: hit.score,
            breakdown: hit.breakdown,
            memory: {
              id: hit.entry.id,
              appId: hit.entry.appId,
              namespace: hit.entry.namespace,
              content: hit.entry.content,
              tags: hit.entry.tags,
              createdAtIso: hit.entry.createdAtIso,
              lastAccessedAtIso: hit.entry.lastAccessedAtIso ?? null,
              emotionalValence: hit.entry.emotionalValence,
              metadata: hit.entry.metadata,
            },
          })),
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/memory/consolidate',
    meta: {
      name: 'memory.consolidate',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'memory:admin',
    },
    validateBody: validateMemoryConsolidateBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.memory.consolidate',
      });

      const authorizedNamespaces = services.consentManager
        .listForWorkspace({
          userId: principal.ownerUserId,
          workspaceId,
        })
        .flatMap((consent) => consent.namespaces);
      const namespaceSet = new Set(authorizedNamespaces);
      const requestedNamespaces = context.request.body.namespaces?.map((entry) =>
        entry.trim().toLowerCase()
      );
      const namespaces = requestedNamespaces && requestedNamespaces.length > 0
        ? requestedNamespaces
        : authorizedNamespaces;

      for (const namespace of namespaces) {
        if (!namespaceSet.has(namespace)) {
          return errorResult({
            status: 403,
            code: 'forbidden',
            message: `Namespace ${namespace} is not authorized for consolidation.`,
          });
        }
      }

      const consolidated = services.memoryProtocol.consolidate({
        userId: principal.ownerUserId,
        workspaceId,
        namespaces,
        dryRun: context.request.body.dryRun ?? false,
        nowIso: context.nowIso,
      });

      const actionSummary = summarizeConsolidationActions(consolidated.report.actions);
      const consents = services.consentManager.listForWorkspace({
        userId: principal.ownerUserId,
        workspaceId,
      });
      for (const consent of consents) {
        if (!consent.permissions.consolidate) continue;
        if (!consent.namespaces.some((namespace) => namespaces.includes(namespace))) continue;
        services.consentManager.recordUsage({
          userId: principal.ownerUserId,
          workspaceId,
          appId: consent.appId,
          operation: 'consolidate',
          nowIso: context.nowIso,
        });
      }

      return {
        data: {
          dryRun: consolidated.report.dryRun,
          namespaces: consolidated.namespaces,
          affectedEntries: consolidated.affectedEntries,
          summary: consolidated.report.summary,
          actionSummary,
          actions: consolidated.report.actions,
        },
      };
    },
  });

};
