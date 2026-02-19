import { describe, expect, it } from 'vitest';
import { WorkspaceManager } from '../../team/workspaceManager';
import { OrgManager } from '../orgManager';
import { EnterpriseProvisioning } from '../provisioning';

describe('enterprise provisioning', () => {
  it('auto-joins workspace from SSO group claim and auto-suspends on deprovision', () => {
    const workspaces = new WorkspaceManager();
    const orgs = new OrgManager();

    const workspace = workspaces.createWorkspace({
      ownerUserId: 'owner-provision',
      name: 'Provisioned Workspace',
      nowIso: '2026-09-09T09:00:00.000Z',
    }).workspace;

    const org = orgs.createOrganization({
      ownerUserId: 'owner-provision',
      name: 'Provision Org',
      workspaceIds: [workspace.id],
      nowIso: '2026-09-09T09:05:00.000Z',
    });

    const provisioning = new EnterpriseProvisioning({
      orgManager: orgs,
      workspaceManager: workspaces,
    });

    provisioning.configureGroupMapping({
      organizationId: org.organization.id,
      group: 'eng-team',
      workspaceIds: [workspace.id],
    });

    const provisioned = provisioning.provisionFromSsoSession({
      organizationId: org.organization.id,
      userId: 'new-member-1',
      email: 'new-member@example.com',
      groups: ['eng-team'],
      nowIso: '2026-09-09T10:00:00.000Z',
    });

    expect(provisioned.joinedWorkspaceIds).toContain(workspace.id);

    const suspended = provisioning.deprovisionUser({
      organizationId: org.organization.id,
      userId: 'new-member-1',
      nowIso: '2026-09-10T10:00:00.000Z',
    });

    expect(suspended.suspendedWorkspaceIds).toContain(workspace.id);
  });
});
