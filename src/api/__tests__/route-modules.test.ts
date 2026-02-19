import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApiKeyManager } from '../auth';
import { createApiGateway } from '../gateway';
import { registerAdminRoutes } from '../route-modules/admin';
import { registerAnalyticsRoutes } from '../route-modules/analytics';
import { registerBillingRoutes } from '../route-modules/billing';
import { registerConversationsRoutes } from '../route-modules/conversations';
import { registerCreatorRoutes } from '../route-modules/creator';
import { registerKnowledgeRoutes } from '../route-modules/knowledge';
import { registerMemoryRoutes } from '../route-modules/memory';
import { registerOpsRoutes } from '../route-modules/ops';
import { registerPipelineRoutes } from '../route-modules/pipeline';
import { createCoreApiRouteServices } from '../route-modules/shared';
import { registerWorkflowRoutes } from '../route-modules/workflows';
import { registerCoreApiRoutes } from '../routes';

const createHarness = () => {
  const authManager = new ApiKeyManager({
    storageKey: `ashim.api.route-modules.${Math.random().toString(16).slice(2)}`,
  });
  authManager.resetForTests();

  const gateway = createApiGateway({ authManager });
  const services = createCoreApiRouteServices();
  return { gateway, services };
};

describe('route module registration', () => {
  it('registers routes per module', () => {
    const { gateway, services } = createHarness();
    const baseline = gateway.getRuntimeInfo().routeCount;

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

    expect(gateway.getRuntimeInfo().routeCount).toBeGreaterThan(baseline + 30);
  });

  it('registerCoreApiRoutes composes all modules and keeps routes.ts small', () => {
    const { gateway } = createHarness();
    registerCoreApiRoutes(gateway);
    expect(gateway.getRuntimeInfo().routeCount).toBe(41);

    const routesFile = readFileSync(resolve(process.cwd(), 'src/api/routes.ts'), 'utf8');
    const lineCount = routesFile.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(250);
  });
});
