import { describe, expect, it } from 'vitest';
import { DataResidencyManager } from '../dataResidency';
import { OrgManager } from '../orgManager';

describe('data residency manager', () => {
  it('blocks write from EU-pinned workspace into US zone without federation approval', () => {
    const orgs = new OrgManager();
    const residency = new DataResidencyManager({ orgManager: orgs });

    const created = orgs.createOrganization({
      ownerUserId: 'owner-zone',
      name: 'Zone Org',
      workspaceIds: ['ws-eu'],
      dataResidencyZone: 'EU',
      nowIso: '2026-09-06T09:00:00.000Z',
    });

    residency.setWorkspaceZone({
      organizationId: created.organization.id,
      workspaceId: 'ws-eu',
      zone: 'EU',
      nowIso: '2026-09-06T09:05:00.000Z',
    });

    expect(() =>
      residency.assertWriteAllowed({
        organizationId: created.organization.id,
        workspaceId: 'ws-eu',
        targetZone: 'US',
      })
    ).toThrow(/Residency violation|requires explicit admin approval/);
  });
});
