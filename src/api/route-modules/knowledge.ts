import type { ApiGateway } from '../gateway';
import {
  ingestKnowledgeFile,
  ingestKnowledgeNote,
  ingestKnowledgeUrl,
  retrieveKnowledge,
  searchKnowledgeSources,
  synthesizeKnowledgeAnswer,
} from '../../knowledge';
import {
  type CoreApiRouteServices,
  errorResult,
  parseCursor,
  parseLimit,
  requirePrincipal,
  requireWorkspaceId,
  requireWorkspacePermission,
  toOptionalString,
  validateKnowledgeIngestBody,
  validateKnowledgeSynthesizeBody,
  withPagination,
  workspaceScopedNamespaceUserId,
} from './shared';

export const registerKnowledgeRoutes = (
  gateway: ApiGateway,
  services: CoreApiRouteServices
): void => {
  gateway.registerRoute({
    method: 'POST',
    path: '/v1/knowledge/ingest',
    meta: {
      name: 'knowledge.ingest',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'knowledge:write',
    },
    validateBody: validateKnowledgeIngestBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.knowledge.write',
      });

      const knowledgeUserId = workspaceScopedNamespaceUserId({
        ownerUserId: principal.ownerUserId,
        workspaceId,
        namespace: 'knowledge',
      });
      const body = context.request.body;

      let result;
      if (body.sourceType === 'note') {
        result = ingestKnowledgeNote(
          {
            userId: knowledgeUserId,
            title: body.title ?? 'API Note',
            text: body.text ?? '',
            tags: body.tags,
          },
          services.knowledgeStore
        );
      } else if (body.sourceType === 'file') {
        result = ingestKnowledgeFile(
          {
            userId: knowledgeUserId,
            title: body.title ?? 'API File',
            text: body.text ?? '',
            mimeType: body.mimeType,
          },
          services.knowledgeStore
        );
      } else {
        result = await services.circuitBreaker.execute(
          'knowledge.ingest.url',
          async () =>
            ingestKnowledgeUrl(
              {
                userId: knowledgeUserId,
                title: body.title ?? body.url ?? 'API URL',
                url: body.url ?? 'https://ashim.local/placeholder',
                text: body.text ?? `Imported from ${body.url ?? 'url source'}.`,
              },
              services.knowledgeStore
            )
        );
      }

      return {
        status: 201,
        data: {
          source: result.source,
          nodesIngested: result.nodes.length,
          edgesIngested: result.edges.length,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'GET',
    path: '/v1/knowledge/search',
    meta: {
      name: 'knowledge.search',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'knowledge:read',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.knowledge.read',
      });

      const query = toOptionalString(context.request.query.q);
      if (!query) {
        return errorResult({
          status: 400,
          code: 'bad_request',
          message: 'q query parameter is required.',
        });
      }
      const topK = parseLimit(context.request.query.topK, 6, 20);
      const knowledgeUserId = workspaceScopedNamespaceUserId({
        ownerUserId: principal.ownerUserId,
        workspaceId,
        namespace: 'knowledge',
      });
      const retrieval = retrieveKnowledge(
        {
          userId: knowledgeUserId,
          query,
          topK,
        },
        services.knowledgeStore
      );

      return {
        data: {
          query: retrieval.query,
          formula: retrieval.formula,
          generatedAtIso: retrieval.generatedAtIso,
          hits: retrieval.hits.map((hit) => ({
            score: hit.score,
            sourceId: hit.source.id,
            sourceTitle: hit.source.title,
            sourceType: hit.source.type,
            nodeId: hit.node.id,
            chunkIndex: hit.node.chunkIndex,
            snippet: hit.node.text.slice(0, 220),
          })),
        },
      };
    },
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
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.knowledge.read',
      });

      const knowledgeUserId = workspaceScopedNamespaceUserId({
        ownerUserId: principal.ownerUserId,
        workspaceId,
        namespace: 'knowledge',
      });
      const sources = searchKnowledgeSources(
        {
          userId: knowledgeUserId,
          term: toOptionalString(context.request.query.term),
          type: (toOptionalString(context.request.query.type) as 'note' | 'file' | 'url' | 'all' | undefined) ?? 'all',
        },
        services.knowledgeStore
      );

      const limit = parseLimit(context.request.query.limit, 50, 200);
      const cursor = parseCursor(context.request.query.cursor);
      const page = withPagination(sources, cursor, limit);

      return {
        data: {
          sources: page.items,
        },
        pagination: {
          limit,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          total: sources.length,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/knowledge/synthesize',
    meta: {
      name: 'knowledge.synthesize',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'knowledge:read',
    },
    validateBody: validateKnowledgeSynthesizeBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.knowledge.read',
      });

      const knowledgeUserId = workspaceScopedNamespaceUserId({
        ownerUserId: principal.ownerUserId,
        workspaceId,
        namespace: 'knowledge',
      });
      const retrieval = retrieveKnowledge(
        {
          userId: knowledgeUserId,
          query: context.request.body.query,
          topK: context.request.body.topK ?? 6,
        },
        services.knowledgeStore
      );
      const synthesis = synthesizeKnowledgeAnswer(retrieval);
      return {
        data: {
          retrieval: {
            query: retrieval.query,
            formula: retrieval.formula,
            hitCount: retrieval.hits.length,
          },
          synthesis,
        },
      };
    },
  });

};
