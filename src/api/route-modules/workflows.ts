import type { ApiGateway } from '../gateway';
import type { Workflow } from '../../workflows';
import {
  type CoreApiRouteServices,
  buildWorkflowFromApiDefinition,
  errorResult,
  mapDomainErrorToRouteError,
  parseCursor,
  parseLimit,
  requirePrincipal,
  requireWorkspaceId,
  requireWorkspacePermission,
  serializeExecution,
  validateWorkflowCreateBody,
  validateWorkflowResolveCheckpointBody,
  withPagination,
  workspaceScopedNamespaceUserId,
} from './shared';

export const registerWorkflowRoutes = (
  gateway: ApiGateway,
  services: CoreApiRouteServices
): void => {
  gateway.registerRoute({
    method: 'POST',
    path: '/v1/workflows',
    meta: {
      name: 'workflows.create',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'workflows:write',
    },
    validateBody: validateWorkflowCreateBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.workflows.write',
      });

      const workflowUserId = workspaceScopedNamespaceUserId({
        ownerUserId: principal.ownerUserId,
        workspaceId,
        namespace: 'workflows',
      });

      let workflow: Workflow;
      if (context.request.body.prompt && !context.request.body.steps) {
        workflow = services.workflowEngine.createFromPrompt({
          userId: workflowUserId,
          prompt: context.request.body.prompt,
          nowIso: context.nowIso,
        });
      } else {
        workflow = services.workflowEngine.saveWorkflow(
          workflowUserId,
          buildWorkflowFromApiDefinition({
            actorScopedUserId: workflowUserId,
            nowIso: context.nowIso,
            body: context.request.body,
          })
        );
      }

      return {
        status: 201,
        data: {
          workflow: {
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            trigger: workflow.trigger,
            stepCount: workflow.steps.length,
            status: workflow.status,
            createdAtIso: workflow.createdAtIso,
            updatedAtIso: workflow.updatedAtIso,
          },
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/workflows/:id/run',
    meta: {
      name: 'workflows.run',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'workflows:run',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.workflows.run',
      });

      const workflowUserId = workspaceScopedNamespaceUserId({
        ownerUserId: principal.ownerUserId,
        workspaceId,
        namespace: 'workflows',
      });
      const workflow = services.workflowEngine.getWorkflow(workflowUserId, context.pathParams.id);
      if (!workflow) {
        return errorResult({
          status: 404,
          code: 'not_found',
          message: `Workflow ${context.pathParams.id} not found.`,
        });
      }

      try {
        const execution = await services.workflowEngine.runWorkflowById({
          userId: workflowUserId,
          workflowId: context.pathParams.id,
          triggerType: 'manual',
        });
        return {
          data: {
            execution: serializeExecution(execution),
          },
        };
      } catch (error) {
        throw mapDomainErrorToRouteError(error, {
          status: 400,
          code: 'bad_request',
          message: 'Workflow execution failed.',
        });
      }
    },
  });

  gateway.registerRoute({
    method: 'GET',
    path: '/v1/workflows/:id/executions',
    meta: {
      name: 'workflows.executions.list',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'workflows:read',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.workflows.read',
      });

      const workflowUserId = workspaceScopedNamespaceUserId({
        ownerUserId: principal.ownerUserId,
        workspaceId,
        namespace: 'workflows',
      });
      const workflow = services.workflowEngine.getWorkflow(workflowUserId, context.pathParams.id);
      if (!workflow) {
        return errorResult({
          status: 404,
          code: 'not_found',
          message: `Workflow ${context.pathParams.id} not found.`,
        });
      }

      const executions = services.workflowEngine.listExecutions(workflowUserId, context.pathParams.id);
      const limit = parseLimit(context.request.query.limit, 50, 200);
      const cursor = parseCursor(context.request.query.cursor);
      const page = withPagination(executions, cursor, limit);

      return {
        data: {
          workflowId: context.pathParams.id,
          executions: page.items.map(serializeExecution),
        },
        pagination: {
          limit,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          total: executions.length,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'GET',
    path: '/v1/workflows/:id/checkpoints',
    meta: {
      name: 'workflows.checkpoints.list',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'workflows:read',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.workflows.read',
      });

      const workflowUserId = workspaceScopedNamespaceUserId({
        ownerUserId: principal.ownerUserId,
        workspaceId,
        namespace: 'workflows',
      });
      const workflow = services.workflowEngine.getWorkflow(workflowUserId, context.pathParams.id);
      if (!workflow) {
        return errorResult({
          status: 404,
          code: 'not_found',
          message: `Workflow ${context.pathParams.id} not found.`,
        });
      }

      const checkpoints = services.workflowEngine
        .listPendingCheckpoints(workflowUserId)
        .filter((checkpoint) => checkpoint.workflowId === context.pathParams.id);

      return {
        data: {
          workflowId: context.pathParams.id,
          checkpoints,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/workflows/:id/checkpoints/:cid/resolve',
    meta: {
      name: 'workflows.checkpoints.resolve',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'workflows:run',
    },
    validateBody: validateWorkflowResolveCheckpointBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.workflows.run',
      });

      const workflowUserId = workspaceScopedNamespaceUserId({
        ownerUserId: principal.ownerUserId,
        workspaceId,
        namespace: 'workflows',
      });
      const workflow = services.workflowEngine.getWorkflow(workflowUserId, context.pathParams.id);
      if (!workflow) {
        return errorResult({
          status: 404,
          code: 'not_found',
          message: `Workflow ${context.pathParams.id} not found.`,
        });
      }

      const checkpoint = services.workflowEngine
        .listCheckpointRequests(workflowUserId)
        .find((entry) => entry.id === context.pathParams.cid);
      if (!checkpoint || checkpoint.workflowId !== context.pathParams.id) {
        return errorResult({
          status: 404,
          code: 'not_found',
          message: `Checkpoint ${context.pathParams.cid} not found for workflow ${context.pathParams.id}.`,
        });
      }

      try {
        const resolved = await services.workflowEngine.resolveCheckpoint({
          userId: workflowUserId,
          requestId: context.pathParams.cid,
          reviewerUserId: principal.ownerUserId,
          decision: context.request.body.decision,
          rejectionReason: context.request.body.rejectionReason,
          editedAction: context.request.body.editedAction,
        });

        return {
          data: {
            checkpoint: resolved.checkpoint,
            execution: resolved.execution ? serializeExecution(resolved.execution) : null,
          },
        };
      } catch (error) {
        throw mapDomainErrorToRouteError(error, {
          status: 400,
          code: 'bad_request',
          message: 'Checkpoint resolution failed.',
        });
      }
    },
  });

};
