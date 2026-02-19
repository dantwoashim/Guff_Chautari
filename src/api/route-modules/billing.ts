import type { ApiGateway } from '../gateway';
import { hydrateWorkspaceBillingState, persistWorkspaceBillingState } from '../../billing';
import {
  type CoreApiRouteServices,
  requirePrincipal,
  requireWorkspaceId,
  requireWorkspacePermission,
  toOptionalString,
  validateBillingChangeTierBody,
} from './shared';

export const registerBillingRoutes = (
  gateway: ApiGateway,
  services: CoreApiRouteServices
): void => {
  gateway.registerRoute({
    method: 'GET',
    path: '/v1/billing/subscription',
    meta: {
      name: 'billing.subscription.read',
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
        action: 'workspace.billing.manage',
      });

      await hydrateWorkspaceBillingState({
        runtime: services.billingRuntime,
        userId: principal.ownerUserId,
        workspaceId,
      });
      const seeded = services.billingRuntime.ensureWorkspaceAccount({
        workspaceId,
        ownerUserId: principal.ownerUserId,
      });
      await persistWorkspaceBillingState({
        runtime: services.billingRuntime,
        userId: principal.ownerUserId,
        workspaceId,
      });

      return {
        data: {
          account: seeded.account,
          customer: seeded.customer,
          subscription: seeded.subscription,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'GET',
    path: '/v1/billing/usage',
    meta: {
      name: 'billing.usage.read',
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
        action: 'workspace.billing.manage',
      });

      await hydrateWorkspaceBillingState({
        runtime: services.billingRuntime,
        userId: principal.ownerUserId,
        workspaceId,
      });
      services.billingRuntime.ensureWorkspaceAccount({
        workspaceId,
        ownerUserId: principal.ownerUserId,
      });
      await persistWorkspaceBillingState({
        runtime: services.billingRuntime,
        userId: principal.ownerUserId,
        workspaceId,
      });

      const fromIso = toOptionalString(context.request.query.from);
      const toIso = toOptionalString(context.request.query.to);

      const summary = services.billingRuntime.getWorkspaceUsageSummary({
        workspaceId,
        fromIso,
        toIso,
        nowIso: context.nowIso,
      });
      const usageRecords = services.billingRuntime.listUsageRecords({
        workspaceId,
        fromIso,
        toIso,
      });

      return {
        data: {
          workspaceId,
          summary,
          usageRecords,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'GET',
    path: '/v1/billing/invoices',
    meta: {
      name: 'billing.invoices.list',
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
        action: 'workspace.billing.manage',
      });

      await hydrateWorkspaceBillingState({
        runtime: services.billingRuntime,
        userId: principal.ownerUserId,
        workspaceId,
      });
      services.billingRuntime.ensureWorkspaceAccount({
        workspaceId,
        ownerUserId: principal.ownerUserId,
      });
      await persistWorkspaceBillingState({
        runtime: services.billingRuntime,
        userId: principal.ownerUserId,
        workspaceId,
      });

      return {
        data: {
          workspaceId,
          invoices: services.billingRuntime.listWorkspaceInvoices(workspaceId),
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/billing/subscription/change-tier',
    meta: {
      name: 'billing.subscription.change_tier',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'workspace:admin',
    },
    validateBody: validateBillingChangeTierBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.billing.manage',
      });

      await hydrateWorkspaceBillingState({
        runtime: services.billingRuntime,
        userId: principal.ownerUserId,
        workspaceId,
      });
      services.billingRuntime.ensureWorkspaceAccount({
        workspaceId,
        ownerUserId: principal.ownerUserId,
      });
      const subscription = services.billingRuntime.changeWorkspaceTier({
        workspaceId,
        tierId: context.request.body.tierId,
        effectiveAtIso: context.request.body.effectiveAtIso,
        nowIso: context.nowIso,
      });
      await persistWorkspaceBillingState({
        runtime: services.billingRuntime,
        userId: principal.ownerUserId,
        workspaceId,
      });

      return {
        data: {
          workspaceId,
          subscription,
        },
      };
    },
  });

};
