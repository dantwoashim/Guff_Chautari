import { describe, expect, it } from 'vitest';
import { OrgManager } from '../orgManager';

describe('org manager', () => {
  it('creates org, adds 3 workspaces, and allows org admin to list all workspaces', () => {
    const manager = new OrgManager();

    const created = manager.createOrganization({
      ownerUserId: 'owner-org',
      name: 'Enterprise Org',
      workspaceIds: ['ws-1'],
      nowIso: '2026-09-01T09:00:00.000Z',
    });

    manager.addWorkspace({
      organizationId: created.organization.id,
      actorUserId: 'owner-org',
      workspaceId: 'ws-2',
      nowIso: '2026-09-01T10:00:00.000Z',
    });
    manager.addWorkspace({
      organizationId: created.organization.id,
      actorUserId: 'owner-org',
      workspaceId: 'ws-3',
      nowIso: '2026-09-01T10:05:00.000Z',
    });

    manager.addOrgAdmin({
      organizationId: created.organization.id,
      actorUserId: 'owner-org',
      targetUserId: 'admin-org',
      role: 'admin',
      nowIso: '2026-09-01T11:00:00.000Z',
    });

    const workspaces = manager.listOrgWorkspaceIds({
      organizationId: created.organization.id,
      actorUserId: 'admin-org',
    });

    expect(workspaces.sort()).toEqual(['ws-1', 'ws-2', 'ws-3']);
  });
});
