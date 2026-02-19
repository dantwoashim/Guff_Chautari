import { generateComplianceReport } from '../../enterprise/compliance';
import { hydrateWorkspaceBillingState, persistWorkspaceBillingState } from '../../billing';
import type { ApiGateway } from '../gateway';
import {
  type CoreApiRouteServices,
  errorResult,
  parseCursor,
  parseDateQuery,
  parseLimit,
  requireOrgAdmin,
  requirePrincipal,
  toOptionalString,
  validateAdminBillingBudgetBody,
  validateAdminConfigureSsoBody,
  withPagination,
} from './shared';

export const registerAdminRoutes = (
  gateway: ApiGateway,
  services: CoreApiRouteServices
): void => {
  gateway.registerRoute({
    method: 'GET',
    path: '/v1/admin/org/:id',
    meta: {
      name: 'admin.org.overview',
      requiresAuth: true,
      requiredCapability: 'workspace:admin',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const organizationId = context.pathParams.id;
      const organization = requireOrgAdmin(services, organizationId, principal.ownerUserId);
      const workspaceIds = services.enterpriseOrgManager.listOrgWorkspaceIds({
        organizationId,
        actorUserId: principal.ownerUserId,
      });
      const admins = services.enterpriseOrgManager.listOrgAdmins({
        organizationId,
        actorUserId: principal.ownerUserId,
      });
      const ssoProviders = services.enterpriseSsoManager.listProviders({
        organizationId,
        actorUserId: principal.ownerUserId,
      });
      const auditEntries = services.enterpriseAuditLog.listEntriesAscending(organizationId);
      const workspaces = workspaceIds.map((workspaceId) => {
        const workspace = services.workspaceManager.getWorkspace(workspaceId);
        let memberCount = 0;
        try {
          memberCount = services.workspaceManager.listMembers(workspaceId, principal.ownerUserId).length;
        } catch {
          memberCount = 0;
        }
        return {
          id: workspaceId,
          name: workspace?.name ?? null,
          slug: workspace?.slug ?? null,
          status: workspace?.status ?? null,
          createdByUserId: workspace?.createdByUserId ?? null,
          memberCount,
        };
      });

      return {
        data: {
          organization,
          admins,
          ssoProviders,
          workspaces,
          audit: {
            totalEntries: auditEntries.length,
            chainValid: services.enterpriseAuditLog.validateChain(organizationId),
          },
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'GET',
    path: '/v1/admin/org/:id/workspaces',
    meta: {
      name: 'admin.org.workspaces.list',
      requiresAuth: true,
      requiredCapability: 'workspace:admin',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const organizationId = context.pathParams.id;
      requireOrgAdmin(services, organizationId, principal.ownerUserId);

      const workspaceIds = services.enterpriseOrgManager.listOrgWorkspaceIds({
        organizationId,
        actorUserId: principal.ownerUserId,
      });
      const workspaces = workspaceIds.map((workspaceId) => {
        const workspace = services.workspaceManager.getWorkspace(workspaceId);
        return {
          id: workspaceId,
          name: workspace?.name ?? null,
          slug: workspace?.slug ?? null,
          status: workspace?.status ?? null,
          createdByUserId: workspace?.createdByUserId ?? null,
        };
      });

      return {
        data: {
          organizationId,
          workspaces,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'GET',
    path: '/v1/admin/org/:id/audit',
    meta: {
      name: 'admin.org.audit.list',
      requiresAuth: true,
      requiredCapability: 'workspace:admin',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const organizationId = context.pathParams.id;
      requireOrgAdmin(services, organizationId, principal.ownerUserId);

      const limit = parseLimit(context.request.query.limit, 50, 500);
      const cursor = parseCursor(context.request.query.cursor);
      const actionFilter = toOptionalString(context.request.query.action)?.toLowerCase();
      const actorUserIdFilter = toOptionalString(context.request.query.actorUserId);
      const resourceTypeFilter = toOptionalString(context.request.query.resourceType);
      const resourceIdFilter = toOptionalString(context.request.query.resourceId);
      const fromMs = parseDateQuery(context.request.query.from);
      const toMs = parseDateQuery(context.request.query.to);

      const filtered = services.enterpriseAuditLog
        .listEntriesAscending(organizationId)
        .filter((entry) => {
          if (actionFilter && !entry.action.toLowerCase().includes(actionFilter)) return false;
          if (actorUserIdFilter && entry.actorUserId !== actorUserIdFilter) return false;
          if (resourceTypeFilter && entry.resourceType !== resourceTypeFilter) return false;
          if (resourceIdFilter && entry.resourceId !== resourceIdFilter) return false;
          const createdAtMs = Date.parse(entry.createdAtIso);
          if (fromMs !== null && createdAtMs < fromMs) return false;
          if (toMs !== null && createdAtMs > toMs) return false;
          return true;
        })
        .sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso));

      const page = withPagination(filtered, cursor, limit);

      return {
        data: {
          organizationId,
          entries: page.items,
          chainValid: services.enterpriseAuditLog.validateChain(organizationId),
          filters: {
            action: actionFilter ?? null,
            actorUserId: actorUserIdFilter ?? null,
            resourceType: resourceTypeFilter ?? null,
            resourceId: resourceIdFilter ?? null,
            from: context.request.query.from ?? null,
            to: context.request.query.to ?? null,
          },
        },
        pagination: {
          limit,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          total: filtered.length,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'GET',
    path: '/v1/admin/org/:id/compliance',
    meta: {
      name: 'admin.org.compliance.read',
      requiresAuth: true,
      requiredCapability: 'workspace:admin',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const organizationId = context.pathParams.id;
      requireOrgAdmin(services, organizationId, principal.ownerUserId);

      const requestedDays = Number(context.request.query.days ?? 30);
      const days =
        Number.isFinite(requestedDays) && requestedDays > 0
          ? Math.min(3650, Math.floor(requestedDays))
          : 30;

      const report = generateComplianceReport(
        {
          organizationId,
          nowIso: context.nowIso,
          days,
        },
        {
          orgManager: services.enterpriseOrgManager,
          auditLog: services.enterpriseAuditLog,
        }
      );

      return {
        data: {
          report,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'GET',
    path: '/v1/admin/org/:id/billing',
    meta: {
      name: 'admin.org.billing.read',
      requiresAuth: true,
      requiredCapability: 'workspace:admin',
    },
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const organizationId = context.pathParams.id;
      requireOrgAdmin(services, organizationId, principal.ownerUserId);

      const workspaceIds = services.enterpriseOrgManager.listOrgWorkspaceIds({
        organizationId,
        actorUserId: principal.ownerUserId,
      });

      for (const workspaceId of workspaceIds) {
        await hydrateWorkspaceBillingState({
          runtime: services.billingRuntime,
          userId: principal.ownerUserId,
          workspaceId,
        });
        services.billingRuntime.ensureWorkspaceAccount({
          workspaceId,
          ownerUserId: principal.ownerUserId,
          organizationId,
        });
        await persistWorkspaceBillingState({
          runtime: services.billingRuntime,
          userId: principal.ownerUserId,
          workspaceId,
        });
      }

      const summary = services.billingRuntime.getOrganizationBillingSummary({
        organizationId,
      });
      const workspaceCosts = services.billingRuntime.getWorkspaceCostAttribution({
        organizationId,
      });

      return {
        data: {
          organizationId,
          summary,
          workspaceCosts,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/admin/org/:id/billing/budgets',
    meta: {
      name: 'admin.org.billing.budget.update',
      requiresAuth: true,
      requiredCapability: 'workspace:admin',
    },
    validateBody: validateAdminBillingBudgetBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const organizationId = context.pathParams.id;
      requireOrgAdmin(services, organizationId, principal.ownerUserId);

      const workspaceIds = services.enterpriseOrgManager.listOrgWorkspaceIds({
        organizationId,
        actorUserId: principal.ownerUserId,
      });
      if (!workspaceIds.includes(context.request.body.workspaceId)) {
        return errorResult({
          status: 400,
          code: 'bad_request',
          message: `Workspace ${context.request.body.workspaceId} is not part of organization ${organizationId}.`,
        });
      }

      await hydrateWorkspaceBillingState({
        runtime: services.billingRuntime,
        userId: principal.ownerUserId,
        workspaceId: context.request.body.workspaceId,
      });
      services.billingRuntime.ensureWorkspaceAccount({
        workspaceId: context.request.body.workspaceId,
        ownerUserId: principal.ownerUserId,
        organizationId,
      });
      const account = services.billingRuntime.setBudgetAlert({
        workspaceId: context.request.body.workspaceId,
        thresholdUsd: context.request.body.thresholdUsd,
        nowIso: context.nowIso,
      });
      await persistWorkspaceBillingState({
        runtime: services.billingRuntime,
        userId: principal.ownerUserId,
        workspaceId: context.request.body.workspaceId,
      });

      return {
        data: {
          organizationId,
          workspaceId: account.workspaceId,
          budgetAlertThresholdUsd: account.budgetAlertThresholdUsd ?? null,
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/admin/org/:id/sso',
    meta: {
      name: 'admin.org.sso.configure',
      requiresAuth: true,
      requiredCapability: 'workspace:admin',
    },
    validateBody: validateAdminConfigureSsoBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const organizationId = context.pathParams.id;
      requireOrgAdmin(services, organizationId, principal.ownerUserId);

      const existing = services.enterpriseSsoManager
        .listProviders({
          organizationId,
          actorUserId: principal.ownerUserId,
        })
        .find(
          (provider) =>
            provider.type === context.request.body.type && provider.name === context.request.body.name
        );

      const provider = services.enterpriseSsoManager.configureProvider({
        organizationId,
        actorUserId: principal.ownerUserId,
        type: context.request.body.type,
        name: context.request.body.name,
        enabled: context.request.body.enabled,
        saml: context.request.body.saml,
        oidc: context.request.body.oidc,
        nowIso: context.nowIso,
      });

      services.enterpriseAuditLog.append({
        organizationId,
        actorUserId: principal.ownerUserId,
        action: existing ? 'sso.provider_updated' : 'sso.provider_configured',
        resourceType: 'sso_provider',
        resourceId: provider.id,
        createdAtIso: context.nowIso,
        metadata: {
          providerType: provider.type,
          providerName: provider.name,
          enabled: provider.enabled,
        },
      });

      return {
        status: existing ? 200 : 201,
        data: {
          provider,
          updated: Boolean(existing),
        },
      };
    },
  });

};
