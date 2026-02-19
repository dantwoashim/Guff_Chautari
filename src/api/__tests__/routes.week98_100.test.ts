import { describe, expect, it } from 'vitest';
import { BillingRuntime } from '../../billing';
import { CreatorPayoutManager, CreatorRevenueShareLedger } from '../../creator';
import { OrgAuditLog } from '../../enterprise/auditLog';
import { OrgManager } from '../../enterprise/orgManager';
import { SSOManager } from '../../enterprise/sso/ssoManager';
import { WorkspacePermissionMiddleware } from '../../team/permissions';
import { WorkspaceManager } from '../../team/workspaceManager';
import { ApiKeyManager } from '../auth';
import { createApiGateway } from '../gateway';
import { registerCoreApiRoutes } from '../routes';

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

const buildHarness = () => {
  const workspaceManager = new WorkspaceManager();
  const enterpriseOrgManager = new OrgManager();
  const enterpriseAuditLog = new OrgAuditLog();
  const enterpriseSsoManager = new SSOManager(enterpriseOrgManager);
  const billingRuntime = new BillingRuntime();
  const creatorRevenueLedger = new CreatorRevenueShareLedger({
    platformFeeRate: 0.2,
  });
  const creatorPayoutManager = new CreatorPayoutManager(creatorRevenueLedger);
  const workspacePermissionMiddleware = new WorkspacePermissionMiddleware({
    resolveActorRole: ({ workspaceId, userId }) => workspaceManager.getMemberRole(workspaceId, userId),
    resolveWorkspaceOwnerUserId: (workspaceId) =>
      workspaceManager.getWorkspace(workspaceId)?.createdByUserId ?? null,
  });

  const authManager = new ApiKeyManager({
    storageKey: `ashim.api.auth.test.week98_100.${Math.random().toString(16).slice(2)}`,
  });
  authManager.resetForTests();

  const gateway = createApiGateway({
    authManager,
  });

  registerCoreApiRoutes(gateway, {
    workspaceManager,
    workspacePermissionMiddleware,
    enterpriseOrgManager,
    enterpriseAuditLog,
    enterpriseSsoManager,
    billingRuntime,
    creatorRevenueLedger,
    creatorPayoutManager,
  });

  return {
    workspaceManager,
    enterpriseOrgManager,
    authManager,
    gateway,
    billingRuntime,
  };
};

describe('week 98-100 billing + creator API routes', () => {
  it('supports workspace billing subscription, usage, invoices, and tier changes', async () => {
    const { workspaceManager, authManager, gateway, billingRuntime } = buildHarness();

    const createdWorkspace = workspaceManager.createWorkspace({
      ownerUserId: 'billing-owner',
      name: 'Billing Workspace',
      nowIso: '2027-01-01T00:00:00.000Z',
    });
    const workspaceId = createdWorkspace.workspace.id;

    billingRuntime.ensureWorkspaceAccount({
      workspaceId,
      ownerUserId: 'billing-owner',
      tierId: 'free',
      nowIso: '2027-01-01T00:00:00.000Z',
    });
    billingRuntime.recordUsage({
      workspaceId,
      metric: 'api_calls',
      quantity: 100,
      nowIso: '2027-01-01T00:00:01.000Z',
    });
    billingRuntime.flushUsage('2027-01-01T00:00:07.000Z');
    billingRuntime.generateWorkspaceInvoice({
      workspaceId,
      periodStartIso: '2027-01-01T00:00:00.000Z',
      periodEndIso: '2027-01-31T00:00:00.000Z',
      nowIso: '2027-01-31T00:00:00.000Z',
    });

    const key = authManager.issueApiKey({
      ownerUserId: 'billing-owner',
      label: 'billing-admin-key',
      scope: 'admin',
      workspaceScopes: [workspaceId],
      nowIso: '2027-01-01T00:01:00.000Z',
    });

    const subscriptionResponse = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/billing/subscription',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(subscriptionResponse.status).toBe(200);
    if (!subscriptionResponse.body.ok) throw new Error('Expected billing subscription success.');
    const subscriptionData = asRecord(subscriptionResponse.body.data);
    const subscription = asRecord(subscriptionData.subscription);
    expect(subscription.status).toBe('active');

    const usageResponse = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/billing/usage',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(usageResponse.status).toBe(200);
    if (!usageResponse.body.ok) throw new Error('Expected billing usage success.');
    const usageData = asRecord(usageResponse.body.data);
    const summary = asRecord(usageData.summary);
    const rows = asArray(summary.rows);
    expect(rows.length).toBeGreaterThan(0);

    const changeTierResponse = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/billing/subscription/change-tier',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        tierId: 'pro',
      },
    });
    expect(changeTierResponse.status).toBe(200);
    if (!changeTierResponse.body.ok) throw new Error('Expected tier change success.');
    const changedTierData = asRecord(changeTierResponse.body.data);
    const changedSubscription = asRecord(changedTierData.subscription);
    expect(changedSubscription.tierId).toBe('pro');

    const invoicesResponse = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/billing/invoices',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(invoicesResponse.status).toBe(200);
    if (!invoicesResponse.body.ok) throw new Error('Expected invoices success.');
    const invoicesData = asRecord(invoicesResponse.body.data);
    expect(asArray(invoicesData.invoices).length).toBeGreaterThan(0);
  });

  it('supports org-level billing summary and budget alerts', async () => {
    const { workspaceManager, enterpriseOrgManager, authManager, gateway, billingRuntime } = buildHarness();

    const ws1 = workspaceManager.createWorkspace({
      ownerUserId: 'org-billing-owner',
      name: 'Workspace 1',
      nowIso: '2027-01-10T00:00:00.000Z',
    }).workspace;
    const ws2 = workspaceManager.createWorkspace({
      ownerUserId: 'org-billing-owner',
      name: 'Workspace 2',
      nowIso: '2027-01-10T00:01:00.000Z',
    }).workspace;

    const createdOrg = enterpriseOrgManager.createOrganization({
      ownerUserId: 'org-billing-owner',
      name: 'Billing Org',
      workspaceIds: [ws1.id, ws2.id],
      nowIso: '2027-01-10T01:00:00.000Z',
    });

    billingRuntime.ensureWorkspaceAccount({
      workspaceId: ws1.id,
      ownerUserId: 'org-billing-owner',
      organizationId: createdOrg.organization.id,
      tierId: 'pro',
      nowIso: '2027-01-10T01:10:00.000Z',
    });
    billingRuntime.ensureWorkspaceAccount({
      workspaceId: ws2.id,
      ownerUserId: 'org-billing-owner',
      organizationId: createdOrg.organization.id,
      tierId: 'team',
      seatCount: 3,
      nowIso: '2027-01-10T01:10:00.000Z',
    });
    billingRuntime.recordUsage({
      workspaceId: ws1.id,
      metric: 'api_calls',
      quantity: 300,
      nowIso: '2027-01-11T01:10:00.000Z',
    });
    billingRuntime.flushUsage('2027-01-11T01:11:00.000Z');

    const key = authManager.issueApiKey({
      ownerUserId: 'org-billing-owner',
      label: 'org-admin-key',
      scope: 'admin',
      workspaceScopes: ['*'],
      nowIso: '2027-01-10T01:15:00.000Z',
    });

    const summaryResponse = await gateway.handleRequest({
      method: 'GET',
      path: `/v1/admin/org/${createdOrg.organization.id}/billing`,
      headers: {
        authorization: `Bearer ${key.apiKey}`,
      },
    });
    expect(summaryResponse.status).toBe(200);
    if (!summaryResponse.body.ok) throw new Error('Expected org billing summary success.');
    const summaryData = asRecord(summaryResponse.body.data);
    const summary = asRecord(summaryData.summary);
    expect(summary.workspaceCount).toBe(2);
    expect(asArray(summaryData.workspaceCosts).length).toBe(2);

    const budgetResponse = await gateway.handleRequest({
      method: 'POST',
      path: `/v1/admin/org/${createdOrg.organization.id}/billing/budgets`,
      headers: {
        authorization: `Bearer ${key.apiKey}`,
      },
      body: {
        workspaceId: ws1.id,
        thresholdUsd: 500,
      },
    });
    expect(budgetResponse.status).toBe(200);
    if (!budgetResponse.body.ok) throw new Error('Expected budget update success.');
    const budgetData = asRecord(budgetResponse.body.data);
    expect(budgetData.workspaceId).toBe(ws1.id);
    expect(budgetData.budgetAlertThresholdUsd).toBe(500);
  });

  it('supports creator monetization summary, events, and payout cycle routes', async () => {
    const { workspaceManager, authManager, gateway } = buildHarness();

    const createdWorkspace = workspaceManager.createWorkspace({
      ownerUserId: 'creator-owner',
      name: 'Creator Workspace',
      nowIso: '2027-02-01T00:00:00.000Z',
    });
    const workspaceId = createdWorkspace.workspace.id;

    const key = authManager.issueApiKey({
      ownerUserId: 'creator-owner',
      label: 'creator-admin-key',
      scope: 'admin',
      workspaceScopes: [workspaceId],
      nowIso: '2027-02-01T00:01:00.000Z',
    });

    const summaryResponse = await gateway.handleRequest({
      method: 'GET',
      path: '/v1/creator/earnings/summary',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(summaryResponse.status).toBe(200);
    if (!summaryResponse.body.ok) throw new Error('Expected creator summary success.');
    const summaryData = asRecord(summaryResponse.body.data);
    const listings = asArray(summaryData.listings);
    expect(listings.length).toBeGreaterThanOrEqual(2);
    const premiumListing = listings
      .map((entry) => asRecord(entry))
      .find((entry) => entry.model === 'premium');
    if (!premiumListing) throw new Error('Expected premium listing.');

    const saleResponse = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/creator/earnings/simulate-sale',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        packId: premiumListing.packId,
        buyerUserId: 'api-sale-buyer',
      },
    });
    expect(saleResponse.status).toBe(200);
    if (!saleResponse.body.ok) throw new Error('Expected creator sale success.');
    const saleData = asRecord(saleResponse.body.data);
    const saleEvent = asRecord(saleData.event);
    expect(saleEvent.eventType).toBe('install_purchase');

    const renewalResponse = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/creator/earnings/simulate-renewal',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        packId: premiumListing.packId,
        buyerUserId: 'api-renewal-buyer',
      },
    });
    expect(renewalResponse.status).toBe(200);
    if (!renewalResponse.body.ok) throw new Error('Expected creator renewal success.');
    const renewalData = asRecord(renewalResponse.body.data);
    const renewalEvent = asRecord(renewalData.event);
    expect(renewalEvent.eventType).toBe('subscription_renewal');

    const payoutResponse = await gateway.handleRequest({
      method: 'POST',
      path: '/v1/creator/earnings/run-payout',
      headers: {
        authorization: `Bearer ${key.apiKey}`,
        'x-workspace-id': workspaceId,
      },
      body: {
        thresholdUsd: 30,
      },
    });
    expect(payoutResponse.status).toBe(200);
    if (!payoutResponse.body.ok) throw new Error('Expected creator payout success.');
    const payoutData = asRecord(payoutResponse.body.data);
    const payoutResult = asRecord(payoutData.payoutResult);
    expect(payoutResult.payoutsCreated).toBe(1);
    const payouts = asArray(payoutResult.payouts);
    expect(payouts.length).toBe(1);
  });
});
