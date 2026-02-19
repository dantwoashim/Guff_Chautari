import { type CertificationCandidate, evaluateCertificationCandidate } from '../../certification';
import { evaluateReleaseGate, evaluateSelfHostReadiness } from '../../operations';
import type { ApiGateway } from '../gateway';
import {
  type CoreApiRouteServices,
  ensureObject,
  errorResult,
  makeId,
  requirePrincipal,
  requireWorkspaceId,
  requireWorkspacePermission,
  toHealthStatus,
  toOptionalString,
  toReleaseStatus,
} from './shared';

export const registerOpsRoutes = (
  gateway: ApiGateway,
  services: CoreApiRouteServices
): void => {
  gateway.registerRoute({
    method: 'POST',
    path: '/v1/certification/evaluate',
    meta: {
      name: 'certification.evaluate',
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

      const input = ensureObject(context.request.body);
      if (!input) {
        return errorResult({
          status: 400,
          code: 'bad_request',
          message: 'Body must be a JSON object with candidate payload.',
        });
      }

      const candidateInput = ensureObject(input.candidate);
      if (!candidateInput) {
        return errorResult({
          status: 400,
          code: 'bad_request',
          message: 'candidate object is required.',
        });
      }

      const kindRaw = toOptionalString(candidateInput.kind);
      if (!kindRaw || !['template', 'plugin', 'vertical'].includes(kindRaw)) {
        return errorResult({
          status: 400,
          code: 'bad_request',
          message: 'candidate.kind must be one of: template, plugin, vertical.',
        });
      }

      const id = toOptionalString(candidateInput.id);
      const name = toOptionalString(candidateInput.name);
      const version = toOptionalString(candidateInput.version);
      if (!id || !name || !version) {
        return errorResult({
          status: 400,
          code: 'bad_request',
          message: 'candidate.id, candidate.name, and candidate.version are required.',
        });
      }

      const documentation = ensureObject(candidateInput.documentation);
      const creator = ensureObject(candidateInput.creator);
      if (!documentation || !creator) {
        return errorResult({
          status: 400,
          code: 'bad_request',
          message: 'candidate.documentation and candidate.creator objects are required.',
        });
      }

      const candidate: CertificationCandidate = {
        id,
        name,
        kind: kindRaw as CertificationCandidate['kind'],
        version,
        schemaValid: Boolean(candidateInput.schemaValid),
        benchmarkScore:
          typeof candidateInput.benchmarkScore === 'number'
            ? candidateInput.benchmarkScore
            : undefined,
        safetySignals: Array.isArray(candidateInput.safetySignals)
          ? candidateInput.safetySignals
              .map((entry) => ensureObject(entry))
              .filter((entry): entry is Record<string, unknown> => Boolean(entry))
              .map((entry) => ({
                id: toOptionalString(entry.id) ?? 'signal',
                passed: Boolean(entry.passed),
                severity:
                  toOptionalString(entry.severity) === 'critical'
                    ? 'critical'
                    : toOptionalString(entry.severity) === 'warning'
                      ? 'warning'
                      : 'info',
                message: toOptionalString(entry.message) ?? 'safety signal',
              }))
          : [],
        documentation: {
          readme: Boolean(documentation.readme),
          setupGuide: Boolean(documentation.setupGuide),
          apiReference: Boolean(documentation.apiReference),
          changelog: Boolean(documentation.changelog),
        },
        creator: {
          tier:
            toOptionalString(creator.tier) === 'Contributor' ||
            toOptionalString(creator.tier) === 'Certified' ||
            toOptionalString(creator.tier) === 'Featured'
              ? (toOptionalString(creator.tier) as CertificationCandidate['creator']['tier'])
              : undefined,
          approvedPackages:
            typeof creator.approvedPackages === 'number'
              ? creator.approvedPackages
              : undefined,
          trustScore: typeof creator.trustScore === 'number' ? creator.trustScore : undefined,
        },
      };

      const result = evaluateCertificationCandidate(candidate, {
        nowIso: context.nowIso,
      });

      return {
        data: result,
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/self-host/readiness',
    meta: {
      name: 'self_host.readiness',
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

      const input = ensureObject(context.request.body);
      if (!input || !Array.isArray(input.services)) {
        return errorResult({
          status: 400,
          code: 'bad_request',
          message: 'services array is required.',
        });
      }

      const servicesPayload = input.services
        .map((serviceEntry) => ensureObject(serviceEntry))
        .filter((serviceEntry): serviceEntry is Record<string, unknown> => Boolean(serviceEntry))
        .map((serviceEntry) => ({
          service: toOptionalString(serviceEntry.service) ?? 'unknown',
          required: Boolean(serviceEntry.required),
          status: toHealthStatus(serviceEntry.status) ?? 'down',
          latencyMs:
            typeof serviceEntry.latencyMs === 'number' ? serviceEntry.latencyMs : undefined,
          message: toOptionalString(serviceEntry.message),
        }));

      if (servicesPayload.length === 0) {
        return errorResult({
          status: 400,
          code: 'bad_request',
          message: 'At least one service entry is required.',
        });
      }

      const report = evaluateSelfHostReadiness({
        services: servicesPayload,
        minimumScore:
          typeof input.minimumScore === 'number' ? input.minimumScore : undefined,
        nowIso: context.nowIso,
      });

      return {
        data: report,
      };
    },
  });

  gateway.registerRoute({
    method: 'POST',
    path: '/v1/release/gate',
    meta: {
      name: 'release.gate',
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

      const input = ensureObject(context.request.body);
      if (!input || !Array.isArray(input.checks)) {
        return errorResult({
          status: 400,
          code: 'bad_request',
          message: 'checks array is required.',
        });
      }

      const checks = input.checks
        .map((checkEntry) => ensureObject(checkEntry))
        .filter((checkEntry): checkEntry is Record<string, unknown> => Boolean(checkEntry))
        .map((checkEntry) => ({
          id: toOptionalString(checkEntry.id) ?? makeId('release-check'),
          category:
            toOptionalString(checkEntry.category) === 'quality' ||
            toOptionalString(checkEntry.category) === 'performance' ||
            toOptionalString(checkEntry.category) === 'security' ||
            toOptionalString(checkEntry.category) === 'integration' ||
            toOptionalString(checkEntry.category) === 'documentation' ||
            toOptionalString(checkEntry.category) === 'operations'
              ? (toOptionalString(checkEntry.category) as
                  | 'quality'
                  | 'performance'
                  | 'security'
                  | 'integration'
                  | 'documentation'
                  | 'operations')
              : 'quality',
          label: toOptionalString(checkEntry.label) ?? 'Untitled check',
          status: toReleaseStatus(checkEntry.status) ?? 'fail',
          required: Boolean(checkEntry.required),
          detail: toOptionalString(checkEntry.detail),
        }));

      if (checks.length === 0) {
        return errorResult({
          status: 400,
          code: 'bad_request',
          message: 'At least one check is required.',
        });
      }

      const report = evaluateReleaseGate({
        checks,
        minimumScore:
          typeof input.minimumScore === 'number' ? input.minimumScore : undefined,
        nowIso: context.nowIso,
      });

      return {
        data: report,
      };
    },
  });

};
