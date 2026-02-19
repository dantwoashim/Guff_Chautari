import type { ApiGateway } from '../gateway';
import { ApiRouteError } from '../gateway';
import {
  type CoreApiRouteServices,
  ensureObject,
  makeId,
  requirePrincipal,
  requireWorkspaceId,
  requireWorkspacePermission,
  toOptionalString,
  validatePipelineRunBody,
} from './shared';

export const registerPipelineRoutes = (
  gateway: ApiGateway,
  services: CoreApiRouteServices
): void => {
  gateway.registerRoute({
    method: 'POST',
    path: '/v1/pipeline/stream/connect',
    meta: {
      name: 'pipeline.stream.connect',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'pipeline:run',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.pipeline.run',
      });

      const body = ensureObject(context.request.body);
      const appId = toOptionalString(body?.appId);
      const connection = services.websocketServer.connect({
        userId: principal.ownerUserId,
        workspaceId,
        appId,
        nowIso: context.nowIso,
      });

      return {
        status: 201,
        data: {
          connection,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/pipeline/run',
    meta: {
      name: 'pipeline.run',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'pipeline:run',
    },
    validateBody: validatePipelineRunBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.pipeline.run',
      });

      const timestamp = context.request.body.contextOverrides?.timestamp ?? Date.now();
      const requestId = context.requestId;
      const connectionId = context.request.body.stream?.connectionId;
      const streamEnabled = context.request.body.stream?.enabled ?? Boolean(connectionId);
      const stageNames = [
        'contextGatherer',
        'identityResolver',
        'emotionalProcessor',
        'promptBuilder',
        'llmCaller',
        'humanizer',
        'learner',
      ];

      if (streamEnabled) {
        services.websocketServer.emit({
          requestId,
          workspaceId,
          userId: principal.ownerUserId,
          connectionId,
          type: 'pipeline.stage_complete',
          payload: {
            stage: 'accepted',
            status: 'ok',
          },
          nowIso: context.nowIso,
        });
      }

      try {
        const result = await services.circuitBreaker.execute(
          'pipeline.orchestrator',
          async () =>
            services.pipelineOrchestrator.run({
              threadId: context.request.body.threadId ?? `api-thread-${workspaceId}`,
              userId: principal.ownerUserId,
              personaId:
                context.request.body.personaId ??
                context.request.body.persona?.id ??
                'api-persona',
              userMessage: {
                id: makeId('msg'),
                role: 'user',
                text: context.request.body.message,
                timestamp,
              },
              timestamp,
              provider: context.request.body.contextOverrides?.provider,
              model: context.request.body.contextOverrides?.model,
              apiKey: context.request.body.contextOverrides?.apiKey,
              temperature: context.request.body.contextOverrides?.temperature,
              persona:
                context.request.body.persona?.name &&
                context.request.body.persona?.systemInstruction
                  ? {
                      id:
                        context.request.body.persona.id ??
                        context.request.body.personaId ??
                        'api-persona',
                      name: context.request.body.persona.name,
                      systemInstruction:
                        context.request.body.persona.systemInstruction,
                      compiledPrompt: context.request.body.persona.compiledPrompt,
                      emotionalDebt: context.request.body.persona.emotionalDebt,
                      attachmentStyle: context.request.body.persona.attachmentStyle,
                    }
                  : undefined,
            })
        );

        if (streamEnabled) {
          for (const stage of stageNames) {
            services.websocketServer.emit({
              requestId,
              workspaceId,
              userId: principal.ownerUserId,
              connectionId,
              type: 'pipeline.stage_complete',
              payload: {
                stage,
                status: 'ok',
              },
              nowIso: context.nowIso,
            });
          }

          for (const chunk of result.llm.chunks) {
            services.websocketServer.emit({
              requestId,
              workspaceId,
              userId: principal.ownerUserId,
              connectionId,
              type: 'pipeline.token',
              payload: {
                index: chunk.index,
                text: chunk.text,
                isFinal: chunk.isFinal,
              },
              nowIso: context.nowIso,
            });
          }

          services.websocketServer.emit({
            requestId,
            workspaceId,
            userId: principal.ownerUserId,
            connectionId,
            type: 'pipeline.done',
            payload: {
              model: result.llm.model,
              provider: result.llm.providerId,
              chunkCount: result.llm.chunks.length,
            },
            nowIso: context.nowIso,
          });
        }

        return {
          data: {
            response: {
              text: result.humanized.messages.map((message) => message.text).join(' '),
              provider: result.llm.providerId,
              model: result.llm.model,
              chunks: result.llm.chunks,
              humanizedMessages: result.humanized.messages,
              strategicNonResponse: result.humanized.strategicNonResponse,
            },
            emotional: {
              identity: result.identity,
              state: result.emotional,
            },
            learning: {
              memoryUpdates: result.learner.extractedMemories,
              relationshipUpdate: result.learner.relationshipUpdate,
              growthEvents: result.learner.growthEvents,
              reflection: result.learner.reflection ?? null,
            },
          },
        };
      } catch (error) {
        if (streamEnabled) {
          services.websocketServer.emit({
            requestId,
            workspaceId,
            userId: principal.ownerUserId,
            connectionId,
            type: 'pipeline.error',
            payload: {
              message: error instanceof Error ? error.message : 'Pipeline failed.',
            },
            nowIso: context.nowIso,
          });
        }

        throw new ApiRouteError({
          status: 500,
          code: 'internal_error',
          message: error instanceof Error ? error.message : 'Pipeline run failed.',
        });
      }
    },
  });

};
