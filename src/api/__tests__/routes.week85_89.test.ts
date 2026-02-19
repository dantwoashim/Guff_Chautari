import { describe, expect, it } from 'vitest';
import { OrgAuditLog } from '../../enterprise/auditLog';
import { OrgManager } from '../../enterprise/orgManager';
import { SSOManager } from '../../enterprise/sso/ssoManager';
import { WorkspaceManager } from '../../team/workspaceManager';
import { ApiKeyManager } from '../auth';
import { createApiGateway } from '../gateway';
import { registerCoreApiRoutes } from '../routes';

type GatewayResponse = Awaited<
  ReturnType<ReturnType<typeof buildHarness>['gateway']['handleRequest']>
>;

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected object payload.');
  }
  return value as Record<string, unknown>;
};

const asArray = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error('Expected array payload.');
  }
  return value;
};

const readData = (response: GatewayResponse): Record<string, unknown> => {
  expect(response.body.ok).toBe(true);
  if (!response.body.ok) {
    throw new Error('Expected success response.');
  }
  return asRecord(response.body.data);
};

const readErrorCode = (response: GatewayResponse): string => {
  const body = response.body as { ok: boolean; error?: { code?: string } };
  expect(body.ok).toBe(false);
  if (body.ok) {
    throw new Error('Expected error response.');
  }
  if (!body.error?.code) {
    throw new Error('Expected error code.');
  }
  return body.error.code;
};

const buildHarness = () => {
  const workspaceManager = new WorkspaceManager();
  const enterpriseOrgManager = new OrgManager();
  const enterpriseAuditLog = new OrgAuditLog();
  const enterpriseSsoManager = new SSOManager(enterpriseOrgManager);

  const authManager = new ApiKeyManager({
    storageKey: `ashim.api.auth.test.week85_89.${Math.random().toString(16).slice(2)}`,
  });
  authManager.resetForTests();

  const gateway = createApiGateway({
    authManager,
  });

  registerCoreApiRoutes(gateway, {
    workspaceManager,
    enterpriseOrgManager,
    enterpriseAuditLog,
    enterpriseSsoManager,
  });

  return {
    workspaceManager,
    enterpriseOrgManager,
    enterpriseAuditLog,
    authManager,
    gateway,
  };
};

describe('week 85-89 enterprise admin API routes', () => {
  it('supports org overview, workspaces, audit, compliance, and SSO configuration lifecycle', async () => {
    const { workspaceManager, enterpriseOrgManager, enterpriseAuditLog, authManager, gateway } = buildHarness();

    const ws1 = workspaceManager.createWorkspace({
      ownerUserId: 'org-owner',
      name: 'Acme Product',
      nowIso: '2026-11-01T08:00:00.000Z',
    }).workspace;
    const ws2 = workspaceManager.createWorkspace({
      ownerUserId: 'org-owner',
      name: 'Acme Operations',
      nowIso: '2026-11-01T08:01:00.000Z',
    }).workspace;
    const ws3 = workspaceManager.createWorkspace({
      ownerUserId: 'org-owner',
      name: 'Acme Research',
      nowIso: '2026-11-01T08:02:00.000Z',
    }).workspace;

    const created = enterpriseOrgManager.createOrganization({
      ownerUserId: 'org-owner',
      name: 'Acme Enterprise',
      workspaceIds: [ws1.id, ws2.id, ws3.id],
      dataResidencyZone: 'EU',
      nowIso: '2026-11-01T09:00:00.000Z',
    });

    enterpriseAuditLog.append({
      organizationId: created.organization.id,
      actorUserId: 'org-owner',
      action: 'member.invite',
      resourceType: 'user',
      resourceId: 'user-42',
      createdAtIso: '2026-11-01T09:05:00.000Z',
    });
    enterpriseAuditLog.append({
      organizationId: created.organization.id,
      actorUserId: 'org-owner',
      action: 'data.accessed',
      resourceType: 'knowledge',
      resourceId: 'graph-1',
      createdAtIso: '2026-11-01T09:10:00.000Z',
    });

    const key = authManager.issueApiKey({
      ownerUserId: 'org-owner',
      label: 'org-admin',
      scope: 'admin',
      workspaceScopes: ['*'],
      nowIso: '2026-11-01T09:15:00.000Z',
    });

    const overview = await gateway.handleRequest({
      method: 'GET',
      path: `/v1/admin/org/${created.organization.id}`,
      headers: {
        authorization: `Bearer ${key.apiKey}`,
      },
    });

    expect(overview.status).toBe(200);
    const overviewData = readData(overview);
    const organization = asRecord(overviewData.organization);
    expect(organization.id).toBe(created.organization.id);
    expect(asArray(overviewData.workspaces)).toHaveLength(3);
    const auditMeta = asRecord(overviewData.audit);
    expect(auditMeta.chainValid).toBe(true);

    const workspaces = await gateway.handleRequest({
      method: 'GET',
      path: `/v1/admin/org/${created.organization.id}/workspaces`,
      headers: {
        authorization: `Bearer ${key.apiKey}`,
      },
    });

    expect(workspaces.status).toBe(200);
    const workspaceData = readData(workspaces);
    expect(asArray(workspaceData.workspaces)).toHaveLength(3);

    const filteredAudit = await gateway.handleRequest({
      method: 'GET',
      path: `/v1/admin/org/${created.organization.id}/audit?action=data.accessed&limit=5`,
      headers: {
        authorization: `Bearer ${key.apiKey}`,
      },
    });

    expect(filteredAudit.status).toBe(200);
    const filteredAuditData = readData(filteredAudit);
    expect(asArray(filteredAuditData.entries)).toHaveLength(1);
    expect(filteredAudit.body.ok ? filteredAudit.body.pagination?.total : 0).toBe(1);

    const compliance = await gateway.handleRequest({
      method: 'GET',
      path: `/v1/admin/org/${created.organization.id}/compliance?days=30`,
      headers: {
        authorization: `Bearer ${key.apiKey}`,
      },
    });

    expect(compliance.status).toBe(200);
    const complianceData = readData(compliance);
    const report = asRecord(complianceData.report);
    expect(report.organizationId).toBe(created.organization.id);
    const soc2Readiness = asRecord(report.soc2Readiness);
    expect(asArray(soc2Readiness.checklist).length).toBeGreaterThan(0);

    const configureSso = await gateway.handleRequest({
      method: 'POST',
      path: `/v1/admin/org/${created.organization.id}/sso`,
      headers: {
        authorization: `Bearer ${key.apiKey}`,
      },
      body: {
        type: 'oidc',
        name: 'Okta OIDC',
        oidc: {
          issuer: 'https://idp.okta.example',
          clientId: 'ashim-enterprise',
          audience: 'ashim',
        },
      },
    });

    expect(configureSso.status).toBe(201);
    const configuredSsoData = readData(configureSso);
    const configuredProvider = asRecord(configuredSsoData.provider);
    expect(configuredProvider.type).toBe('oidc');

    const updateSso = await gateway.handleRequest({
      method: 'POST',
      path: `/v1/admin/org/${created.organization.id}/sso`,
      headers: {
        authorization: `Bearer ${key.apiKey}`,
      },
      body: {
        type: 'oidc',
        name: 'Okta OIDC',
        enabled: false,
        oidc: {
          issuer: 'https://idp.okta.example',
          clientId: 'ashim-enterprise-v2',
          audience: 'ashim',
        },
      },
    });

    expect(updateSso.status).toBe(200);
    const updatedSsoData = readData(updateSso);
    expect(updatedSsoData.updated).toBe(true);

    const ssoAudit = await gateway.handleRequest({
      method: 'GET',
      path: `/v1/admin/org/${created.organization.id}/audit?action=sso.provider_updated`,
      headers: {
        authorization: `Bearer ${key.apiKey}`,
      },
    });
    expect(ssoAudit.status).toBe(200);
    const ssoAuditData = readData(ssoAudit);
    expect(asArray(ssoAuditData.entries)).toHaveLength(1);
  });

  it('rejects admin routes for users who are not org admins', async () => {
    const { enterpriseOrgManager, authManager, gateway } = buildHarness();

    const created = enterpriseOrgManager.createOrganization({
      ownerUserId: 'org-owner',
      name: 'Org Access Check',
      nowIso: '2026-11-02T09:00:00.000Z',
    });

    const outsiderKey = authManager.issueApiKey({
      ownerUserId: 'outsider-user',
      label: 'outsider',
      scope: 'admin',
      workspaceScopes: ['*'],
      nowIso: '2026-11-02T09:01:00.000Z',
    });

    const response = await gateway.handleRequest({
      method: 'GET',
      path: `/v1/admin/org/${created.organization.id}`,
      headers: {
        authorization: `Bearer ${outsiderKey.apiKey}`,
      },
    });

    expect(response.status).toBe(403);
    expect(readErrorCode(response)).toBe('forbidden');
  });

  it('validates SSO configuration body for enterprise admin endpoint', async () => {
    const { enterpriseOrgManager, authManager, gateway } = buildHarness();

    const created = enterpriseOrgManager.createOrganization({
      ownerUserId: 'org-owner',
      name: 'Org Validation',
      nowIso: '2026-11-03T10:00:00.000Z',
    });

    const key = authManager.issueApiKey({
      ownerUserId: 'org-owner',
      label: 'org-owner-key',
      scope: 'admin',
      workspaceScopes: ['*'],
      nowIso: '2026-11-03T10:05:00.000Z',
    });

    const response = await gateway.handleRequest({
      method: 'POST',
      path: `/v1/admin/org/${created.organization.id}/sso`,
      headers: {
        authorization: `Bearer ${key.apiKey}`,
      },
      body: {
        type: 'oidc',
        name: 'Broken Provider',
      },
    });

    expect(response.status).toBe(400);
    expect(readErrorCode(response)).toBe('validation_failed');
  });
});
