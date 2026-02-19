import {
  hydrateCreatorMonetizationState,
  persistCreatorMonetizationState,
} from '../../creator/persistence';
import { ApiRouteError, type ApiGateway } from '../gateway';
import type { ApiBodyValidator, ApiValidationResult } from '../types';
import {
  type CoreApiRouteServices,
  ensureObject,
  requirePrincipal,
  requireWorkspaceId,
  requireWorkspacePermission,
  toOptionalString,
} from './shared';

interface CreatorEarningsMutationBody {
  packId?: string;
  buyerUserId?: string;
  unitPriceUsd?: number;
  nowIso?: string;
}

interface CreatorRunPayoutBody {
  thresholdUsd?: number;
  nowIso?: string;
}

const parseOptionalPositiveNumber = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Number(value.toFixed(2));
};

const validateCreatorEarningsMutationBody: ApiBodyValidator<CreatorEarningsMutationBody> = (
  body
): ApiValidationResult<CreatorEarningsMutationBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  if (input.unitPriceUsd !== undefined && parseOptionalPositiveNumber(input.unitPriceUsd) === undefined) {
    return {
      ok: false,
      issues: ['unitPriceUsd must be a positive number when provided.'],
    };
  }

  return {
    ok: true,
    data: {
      packId: toOptionalString(input.packId),
      buyerUserId: toOptionalString(input.buyerUserId),
      unitPriceUsd: parseOptionalPositiveNumber(input.unitPriceUsd),
      nowIso: toOptionalString(input.nowIso),
    },
  };
};

const validateCreatorRunPayoutBody: ApiBodyValidator<CreatorRunPayoutBody> = (
  body
): ApiValidationResult<CreatorRunPayoutBody> => {
  const input = ensureObject(body);
  if (!input) {
    return {
      ok: false,
      issues: ['Body must be a JSON object.'],
    };
  }

  const thresholdUsd = parseOptionalPositiveNumber(input.thresholdUsd);
  if (input.thresholdUsd !== undefined && thresholdUsd === undefined) {
    return {
      ok: false,
      issues: ['thresholdUsd must be a positive number when provided.'],
    };
  }

  return {
    ok: true,
    data: {
      thresholdUsd,
      nowIso: toOptionalString(input.nowIso),
    },
  };
};

const ensureCreatorBaseline = (
  services: CoreApiRouteServices,
  payload: {
    creatorUserId: string;
    nowIso: string;
  }
): { premiumPackId: string; changed: boolean } => {
  const freePackId = `pack-${payload.creatorUserId}-community`;
  const premiumPackId = `pack-${payload.creatorUserId}-premium`;
  let changed = false;

  if (!services.creatorRevenueLedger.getPackListing(freePackId)) {
    services.creatorRevenueLedger.registerPack({
      packId: freePackId,
      creatorUserId: payload.creatorUserId,
      model: 'free',
      title: 'Community Starter Pack',
      nowIso: payload.nowIso,
    });
    changed = true;
  }

  if (!services.creatorRevenueLedger.getPackListing(premiumPackId)) {
    services.creatorRevenueLedger.registerPack({
      packId: premiumPackId,
      creatorUserId: payload.creatorUserId,
      model: 'premium',
      unitPriceUsd: 29,
      title: 'Premium Growth Pack',
      nowIso: payload.nowIso,
    });
    changed = true;
  }

  if (!services.creatorPayoutManager.getConnectAccount(payload.creatorUserId)) {
    services.creatorPayoutManager.connectCreatorAccount({
      creatorUserId: payload.creatorUserId,
      connectAccountId: `acct_${payload.creatorUserId.slice(0, 12)}`,
      taxFormStatus: 'verified',
      nowIso: payload.nowIso,
    });
    changed = true;
  }

  return {
    premiumPackId,
    changed,
  };
};

const buildCreatorSummary = (
  services: CoreApiRouteServices,
  payload: { creatorUserId: string; nowIso: string }
) => {
  return {
    creatorUserId: payload.creatorUserId,
    listings: services.creatorRevenueLedger.listPackListings(payload.creatorUserId),
    summary: services.creatorRevenueLedger.summarizeCreator({
      creatorUserId: payload.creatorUserId,
      payoutThresholdUsd: 50,
    }),
    packPerformance: services.creatorRevenueLedger.listPackPerformance(payload.creatorUserId),
    payouts: services.creatorPayoutManager.listPayouts(payload.creatorUserId),
    taxDocuments: services.creatorPayoutManager.listTaxDocuments({
      creatorUserId: payload.creatorUserId,
      taxYear: new Date(payload.nowIso).getFullYear() - 1,
    }),
    events: services.creatorRevenueLedger.listEvents({
      creatorUserId: payload.creatorUserId,
      includeSettled: true,
    }),
  };
};

export const registerCreatorRoutes = (
  gateway: ApiGateway,
  services: CoreApiRouteServices
): void => {
  gateway.registerRoute({
    method: 'GET',
    path: '/v1/creator/earnings/summary',
    meta: {
      name: 'creator.earnings.summary',
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

      await hydrateCreatorMonetizationState({
        userId: principal.ownerUserId,
        creatorUserId: principal.ownerUserId,
        revenueLedger: services.creatorRevenueLedger,
        payoutManager: services.creatorPayoutManager,
      });

      const baseline = ensureCreatorBaseline(services, {
        creatorUserId: principal.ownerUserId,
        nowIso: context.nowIso,
      });
      if (baseline.changed) {
        await persistCreatorMonetizationState({
          userId: principal.ownerUserId,
          creatorUserId: principal.ownerUserId,
          revenueLedger: services.creatorRevenueLedger,
          payoutManager: services.creatorPayoutManager,
        });
      }

      return {
        data: buildCreatorSummary(services, {
          creatorUserId: principal.ownerUserId,
          nowIso: context.nowIso,
        }),
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/creator/earnings/simulate-sale',
    meta: {
      name: 'creator.earnings.simulate_sale',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'workspace:admin',
    },
    validateBody: validateCreatorEarningsMutationBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.billing.manage',
      });

      await hydrateCreatorMonetizationState({
        userId: principal.ownerUserId,
        creatorUserId: principal.ownerUserId,
        revenueLedger: services.creatorRevenueLedger,
        payoutManager: services.creatorPayoutManager,
      });

      const baseline = ensureCreatorBaseline(services, {
        creatorUserId: principal.ownerUserId,
        nowIso: context.request.body.nowIso ?? context.nowIso,
      });
      const packId = context.request.body.packId ?? baseline.premiumPackId;
      const listing = services.creatorRevenueLedger.getPackListing(packId);
      if (!listing) {
        throw new ApiRouteError({
          status: 404,
          code: 'not_found',
          message: `Pack ${packId} not found.`,
        });
      }
      if (listing.creatorUserId !== principal.ownerUserId) {
        throw new ApiRouteError({
          status: 403,
          code: 'forbidden',
          message: `Pack ${packId} does not belong to creator ${principal.ownerUserId}.`,
        });
      }

      const event = services.creatorRevenueLedger.recordInstallSale({
        packId,
        buyerUserId: context.request.body.buyerUserId ?? `buyer-${Date.now()}`,
        unitPriceUsd: context.request.body.unitPriceUsd,
        nowIso: context.request.body.nowIso ?? context.nowIso,
      });

      await persistCreatorMonetizationState({
        userId: principal.ownerUserId,
        creatorUserId: principal.ownerUserId,
        revenueLedger: services.creatorRevenueLedger,
        payoutManager: services.creatorPayoutManager,
      });

      return {
        data: {
          event,
          creator: buildCreatorSummary(services, {
            creatorUserId: principal.ownerUserId,
            nowIso: context.nowIso,
          }),
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/creator/earnings/simulate-renewal',
    meta: {
      name: 'creator.earnings.simulate_renewal',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'workspace:admin',
    },
    validateBody: validateCreatorEarningsMutationBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.billing.manage',
      });

      await hydrateCreatorMonetizationState({
        userId: principal.ownerUserId,
        creatorUserId: principal.ownerUserId,
        revenueLedger: services.creatorRevenueLedger,
        payoutManager: services.creatorPayoutManager,
      });

      const baseline = ensureCreatorBaseline(services, {
        creatorUserId: principal.ownerUserId,
        nowIso: context.request.body.nowIso ?? context.nowIso,
      });
      const packId = context.request.body.packId ?? baseline.premiumPackId;
      const listing = services.creatorRevenueLedger.getPackListing(packId);
      if (!listing) {
        throw new ApiRouteError({
          status: 404,
          code: 'not_found',
          message: `Pack ${packId} not found.`,
        });
      }
      if (listing.creatorUserId !== principal.ownerUserId) {
        throw new ApiRouteError({
          status: 403,
          code: 'forbidden',
          message: `Pack ${packId} does not belong to creator ${principal.ownerUserId}.`,
        });
      }

      const event = services.creatorRevenueLedger.recordSubscriptionRenewal({
        packId,
        buyerUserId: context.request.body.buyerUserId ?? `renewal-${Date.now()}`,
        unitPriceUsd: context.request.body.unitPriceUsd,
        nowIso: context.request.body.nowIso ?? context.nowIso,
      });

      await persistCreatorMonetizationState({
        userId: principal.ownerUserId,
        creatorUserId: principal.ownerUserId,
        revenueLedger: services.creatorRevenueLedger,
        payoutManager: services.creatorPayoutManager,
      });

      return {
        data: {
          event,
          creator: buildCreatorSummary(services, {
            creatorUserId: principal.ownerUserId,
            nowIso: context.nowIso,
          }),
        },
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/creator/earnings/run-payout',
    meta: {
      name: 'creator.earnings.run_payout',
      requiresAuth: true,
      requireWorkspace: true,
      requiredCapability: 'workspace:admin',
    },
    validateBody: validateCreatorRunPayoutBody,
    handler: async (context) => {
      const principal = requirePrincipal(context.principal);
      const workspaceId = requireWorkspaceId(context.workspaceId);
      await requireWorkspacePermission({
        middleware: services.workspacePermissionMiddleware,
        workspaceId,
        actorUserId: principal.ownerUserId,
        action: 'workspace.billing.manage',
      });

      await hydrateCreatorMonetizationState({
        userId: principal.ownerUserId,
        creatorUserId: principal.ownerUserId,
        revenueLedger: services.creatorRevenueLedger,
        payoutManager: services.creatorPayoutManager,
      });
      ensureCreatorBaseline(services, {
        creatorUserId: principal.ownerUserId,
        nowIso: context.request.body.nowIso ?? context.nowIso,
      });

      const payoutResult = services.creatorPayoutManager.runPayoutCycle({
        creatorUserIds: [principal.ownerUserId],
        thresholdUsd: context.request.body.thresholdUsd,
        nowIso: context.request.body.nowIso ?? context.nowIso,
      });

      await persistCreatorMonetizationState({
        userId: principal.ownerUserId,
        creatorUserId: principal.ownerUserId,
        revenueLedger: services.creatorRevenueLedger,
        payoutManager: services.creatorPayoutManager,
      });

      return {
        data: {
          payoutResult,
          creator: buildCreatorSummary(services, {
            creatorUserId: principal.ownerUserId,
            nowIso: context.nowIso,
          }),
        },
      };
    },
  });
};
