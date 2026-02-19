import { createApiAnalyticsMiddleware } from './analytics';
import type { ApiGateway } from './gateway';
import { createApiRateLimitMiddleware } from './rateLimiter';
import { registerAdminRoutes } from './route-modules/admin';
import { registerAnalyticsRoutes } from './route-modules/analytics';
import { registerBillingRoutes } from './route-modules/billing';
import { registerConversationsRoutes } from './route-modules/conversations';
import { registerCreatorRoutes } from './route-modules/creator';
import { registerKnowledgeRoutes } from './route-modules/knowledge';
import { registerMemoryRoutes } from './route-modules/memory';
import { registerOpsRoutes } from './route-modules/ops';
import { registerPipelineRoutes } from './route-modules/pipeline';
import {
  createCoreApiRouteServices,
  type CoreApiRouteServices,
} from './route-modules/shared';
import { registerWorkflowRoutes } from './route-modules/workflows';

const analyticsMiddlewareGateways = new WeakSet<ApiGateway>();
const rateLimitMiddlewareGateways = new WeakSet<ApiGateway>();

export {
  ApiConversationRuntime,
  createCoreApiRouteServices,
  type CoreApiRouteServices,
} from './route-modules/shared';

export const registerCoreApiRoutes = (
  gateway: ApiGateway,
  overrides: Partial<CoreApiRouteServices> = {}
): CoreApiRouteServices => {
  const services = createCoreApiRouteServices(overrides);

  if (!analyticsMiddlewareGateways.has(gateway)) {
    gateway.use(createApiAnalyticsMiddleware(services.apiAnalytics));
    analyticsMiddlewareGateways.add(gateway);
  }

  if (!rateLimitMiddlewareGateways.has(gateway)) {
    gateway.use(createApiRateLimitMiddleware(services.rateLimiter));
    rateLimitMiddlewareGateways.add(gateway);
  }

  registerConversationsRoutes(gateway, services);
  registerKnowledgeRoutes(gateway, services);
  registerMemoryRoutes(gateway, services);
  registerPipelineRoutes(gateway, services);
  registerAnalyticsRoutes(gateway, services);
  registerWorkflowRoutes(gateway, services);
  registerBillingRoutes(gateway, services);
  registerCreatorRoutes(gateway, services);
  registerOpsRoutes(gateway, services);
  registerAdminRoutes(gateway, services);

  return services;
};
