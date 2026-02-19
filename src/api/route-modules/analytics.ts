import type { ApiGateway } from '../gateway';
import {
  type CoreApiRouteServices,
  parseLimit,
  requirePrincipal,
  requireWorkspaceId,
  requireWorkspacePermission,
} from './shared';

export const registerAnalyticsRoutes = (
  gateway: ApiGateway,
  services: CoreApiRouteServices
): void => {
  gateway.registerRoute({
    method: 'GET',
    path: '/v1/analytics/usage',
    meta: {
      name: 'analytics.usage',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'workspace:admin',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.settings.manage',
      });

      const windowMinutes = parseLimit(context.request.query.windowMinutes, 60, 24 * 60);
      const keyUsage = services.rateLimiter.inspect(principal.keyId);
      const keyAnalytics = services.apiAnalytics.summarize({
        keyId: principal.keyId,
        windowMinutes,
        nowIso: context.nowIso,
      });
      const ownerAnalytics = services.apiAnalytics.summarize({
        ownerUserId: principal.ownerUserId,
        windowMinutes,
        nowIso: context.nowIso,
      });

      return {
        data: {
          keyId: principal.keyId,
          keyUsage,
          analytics: {
            keyWindow: keyAnalytics,
            ownerWindow: ownerAnalytics,
          },
        },
      };
    },
  });

};
