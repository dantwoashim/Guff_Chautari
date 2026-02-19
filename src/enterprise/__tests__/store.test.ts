import { beforeEach, describe, expect, it } from 'vitest';
import { useEnterpriseStore } from '../store';
import type { Organization } from '../types';

const org = (id: string): Organization => ({
  id,
  name: `Org ${id}`,
  slug: `org-${id}`,
  status: 'active',
  createdByUserId: 'owner-store',
  createdAtIso: '2026-09-03T09:00:00.000Z',
  updatedAtIso: '2026-09-03T09:00:00.000Z',
  workspaceIds: [],
  dataResidencyZone: 'US',
  policy: {
    requireSso: false,
    allowCrossZoneFederation: false,
    auditRetentionDays: 365,
    keyRotationDays: 90,
    allowedEmailDomains: [],
  },
});

beforeEach(() => {
  useEnterpriseStore.getState().resetEnterpriseStore();
});

describe('enterprise store', () => {
  it('maintains org-scoped workspace/admin/provider state', () => {
    const store = useEnterpriseStore.getState();

    store.upsertOrganization(org('org-1'));
    store.upsertOrganization(org('org-2'));
    store.setCurrentOrganizationId('org-1');

    store.setOrganizationWorkspaces('org-1', ['ws-1', 'ws-2']);
    store.setOrganizationWorkspaces('org-2', ['ws-a']);

    const next = useEnterpriseStore.getState();
    expect(next.currentOrganizationId).toBe('org-1');
    expect(next.workspacesByOrganization['org-1']).toEqual(['ws-1', 'ws-2']);
    expect(next.workspacesByOrganization['org-2']).toEqual(['ws-a']);
  });
});
