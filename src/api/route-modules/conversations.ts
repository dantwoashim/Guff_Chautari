import { ApiRouteError, type ApiGateway } from '../gateway';
import {
  type CoreApiRouteServices,
  errorResult,
  mapDomainErrorToRouteError,
  parseCursor,
  parseLimit,
  requirePrincipal,
  requireWorkspaceId,
  requireWorkspacePermission,
  resolveConversationApiKey,
  validateCreateConversationBody,
  validateSendMessageBody,
  withPagination,
} from './shared';

export const registerConversationsRoutes = (
  gateway: ApiGateway,
  services: CoreApiRouteServices
): void => {
  gateway.registerRoute({
    method: 'POST',
    path: '/v1/conversations',
    meta: {
      name: 'conversations.create',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'conversations:write',
    },
    validateBody: validateCreateConversationBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.conversations.write',
      });

      const body = context.request.body;
      const conversation = services.conversationService.createConversation({
        workspaceId,
        createdByUserId: principal.ownerUserId,
        title: body.title ?? body.personaName ?? 'API Conversation',
        participantUserIds: body.participantUserIds ?? [],
      });

      services.conversationRuntime.setMetadata({
        conversationId: conversation.id,
        workspaceId,
        personaId: body.personaId,
        personaName: body.personaName,
      });

      return {
        status: 201,
        data: {
          conversation: {
            id: conversation.id,
            workspaceId: conversation.workspaceId,
            title: conversation.title,
            participantUserIds: conversation.participantUserIds,
            createdAtIso: conversation.createdAtIso,
            updatedAtIso: conversation.updatedAtIso,
            personaId: body.personaId ?? null,
            personaName: body.personaName ?? null,
            archived: false,
          },
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'GET',
    path: '/v1/conversations/:id/messages',
    meta: {
      name: 'conversations.messages.list',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'conversations:read',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.conversations.read',
      });

      const metadata = services.conversationRuntime.getMetadata(context.pathParams.id);
      if (!metadata || metadata.workspaceId !== workspaceId || metadata.archivedAtIso) {
        return errorResult({
          status: 404,
          code: 'not_found',
          message: `Conversation ${context.pathParams.id} not found.`,
        });
      }

      const messages = services.conversationService.listMessagesForUser({
        conversationId: context.pathParams.id,
        userId: principal.ownerUserId,
      });
      const limit = parseLimit(context.request.query.limit, 50, 200);
      const cursor = parseCursor(context.request.query.cursor);
      const page = withPagination(messages, cursor, limit);

      return {
        data: {
          conversationId: context.pathParams.id,
          messages: page.items,
        },
        pagination: {
          limit,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          total: messages.length,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/conversations/:id/messages',
    meta: {
      name: 'conversations.messages.create',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'conversations:write',
    },
    validateBody: validateSendMessageBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.conversations.write',
      });

      const metadata = services.conversationRuntime.getMetadata(context.pathParams.id);
      if (!metadata || metadata.workspaceId !== workspaceId || metadata.archivedAtIso) {
        return errorResult({
          status: 404,
          code: 'not_found',
          message: `Conversation ${context.pathParams.id} not found.`,
        });
      }

      try {
        const normalizedText = (context.request.body.text ?? '').trim();
        const attachmentSummary =
          context.request.body.attachments && context.request.body.attachments.length > 0
            ? `[User shared ${context.request.body.attachments.length} attachment(s)]`
            : '';
        const userText = normalizedText || attachmentSummary;

        const userMessage = services.conversationService.appendUserMessage({
          conversationId: context.pathParams.id,
          authorUserId: principal.ownerUserId,
          text: userText,
        });

        const timestamp = context.request.body.contextOverrides?.timestamp ?? Date.now();
        const apiKey = await resolveConversationApiKey(
          context.request.body.contextOverrides?.apiKey
        );
        if (!apiKey) {
          throw new ApiRouteError({
            status: 422,
            code: 'bad_request',
            message:
              'Gemini key unavailable. Provide contextOverrides.apiKey or configure BYOK key.',
          });
        }

        const pipelineResult = await services.circuitBreaker.execute(
          'conversations.pipeline',
          async () =>
            services.pipelineOrchestrator.run(
              {
                threadId: context.pathParams.id,
                userId: principal.ownerUserId,
                personaId: metadata.personaId ?? 'api-persona',
                timestamp,
                provider: context.request.body.contextOverrides?.provider,
                model: context.request.body.contextOverrides?.model,
                temperature: context.request.body.contextOverrides?.temperature,
                apiKey,
                userMessage: {
                  id: userMessage.id,
                  role: 'user',
                  text: normalizedText || userText,
                  timestamp,
                  attachments: context.request.body.attachments,
                },
                persona: metadata.personaName
                  ? {
                      id: metadata.personaId ?? 'api-persona',
                      name: metadata.personaName,
                      systemInstruction: `You are ${metadata.personaName}. Stay consistent with that persona.`,
                    }
                  : undefined,
              },
              {
                maxRetries: 1,
                retryDelayMs: 150,
              }
            )
        );

        const assistantText =
          pipelineResult.humanized.messages.map((message) => message.text).join(' ').trim() ||
          pipelineResult.llm.text ||
          'I processed your message.';
        const assistantMessage = services.conversationService.appendAssistantMessage({
          conversationId: context.pathParams.id,
          actorUserId: principal.ownerUserId,
          text: assistantText,
        });

        return {
          status: 201,
          data: {
            conversationId: context.pathParams.id,
            userMessage,
            assistantMessage,
            pipeline: {
              provider: pipelineResult.llm.providerId,
              model: pipelineResult.llm.model,
              chunkCount: pipelineResult.llm.chunks.length,
              requestId: context.requestId,
            },
          },
        };
      } catch (error) {
        if (error instanceof ApiRouteError) throw error;
        throw mapDomainErrorToRouteError(error, {
          status: 500,
          code: 'bad_request',
          message: 'Unable to append message through pipeline.',
        });
      }
    },
  });

  gateway.registerRoute({
    method: 'DELETE',
    path: '/v1/conversations/:id',
    meta: {
      name: 'conversations.archive',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'conversations:write',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.conversations.write',
      });

      const metadata = services.conversationRuntime.getMetadata(context.pathParams.id);
      if (!metadata || metadata.workspaceId !== workspaceId) {
        return errorResult({
          status: 404,
          code: 'not_found',
          message: `Conversation ${context.pathParams.id} not found.`,
        });
      }
      if (metadata.archivedAtIso) {
        return {
          data: {
            conversationId: context.pathParams.id,
            archived: true,
            archivedAtIso: metadata.archivedAtIso,
          },
        };
      }

      try {
        services.conversationService.listMessagesForUser({
          conversationId: context.pathParams.id,
          userId: principal.ownerUserId,
        });
      } catch (error) {
        throw mapDomainErrorToRouteError(error, {
          status: 403,
          code: 'forbidden',
          message: 'Conversation archive denied.',
        });
      }

      const archived = services.conversationRuntime.archive(context.pathParams.id, context.nowIso);
      return {
        data: {
          conversationId: context.pathParams.id,
          archived: true,
          archivedAtIso: archived?.archivedAtIso ?? context.nowIso,
        },
      };
    },
  });

};
