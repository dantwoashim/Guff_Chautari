import type { Organization, OrgAdmin, DataResidencyZone, OrgPolicy } from './types';

const defaultPolicy = (): OrgPolicy => ({
  requireSso: false,
  allowCrossZoneFederation: false,
  auditRetentionDays: 365,
  keyRotationDays: 90,
  allowedEmailDomains: [],
});

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'organization';

const roleRank: Record<OrgAdmin['role'], number> = {
  owner: 2,
  admin: 1,
};

export class OrgManager {
  private organizations = new Map<string, Organization>();
  private adminsByOrg = new Map<string, OrgAdmin[]>();
  private orgByWorkspaceId = new Map<string, string>();

  createOrganization(payload: {
    ownerUserId: string;
    name: string;
    slug?: string;
    workspaceIds?: string[];
    dataResidencyZone?: DataResidencyZone;
    policy?: Partial<OrgPolicy>;
    nowIso?: string;
  }): { organization: Organization; ownerAdmin: OrgAdmin } {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const id = makeId('org');
    const organization: Organization = {
      id,
      name: payload.name.trim() || 'Untitled Organization',
      slug: payload.slug ? slugify(payload.slug) : slugify(payload.name),
      status: 'active',
      createdByUserId: payload.ownerUserId,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      workspaceIds: [...new Set(payload.workspaceIds ?? [])],
      dataResidencyZone: payload.dataResidencyZone ?? 'US',
      policy: {
        ...defaultPolicy(),
        ...(payload.policy ?? {}),
      },
    };

    const ownerAdmin: OrgAdmin = {
      id: makeId('org-admin'),
      organizationId: id,
      userId: payload.ownerUserId,
      role: 'owner',
      createdAtIso: nowIso,
    };

    this.organizations.set(id, organization);
    this.adminsByOrg.set(id, [ownerAdmin]);

    for (const workspaceId of organization.workspaceIds) {
      this.orgByWorkspaceId.set(workspaceId, id);
    }

    return { organization, ownerAdmin };
  }

  getOrganization(organizationId: string): Organization | null {
    return this.organizations.get(organizationId) ?? null;
  }

  getOrganizationByWorkspace(workspaceId: string): Organization | null {
    const orgId = this.orgByWorkspaceId.get(workspaceId);
    if (!orgId) return null;
    return this.getOrganization(orgId);
  }

  listOrganizationsForUser(userId: string): Organization[] {
    const adminOrgIds = new Set(
      [...this.adminsByOrg.entries()]
        .filter(([, admins]) => admins.some((admin) => admin.userId === userId))
        .map(([orgId]) => orgId)
    );

    return [...adminOrgIds]
      .map((orgId) => this.organizations.get(orgId))
      .filter((org): org is Organization => Boolean(org))
      .sort((left, right) => Date.parse(right.updatedAtIso) - Date.parse(left.updatedAtIso));
  }

  listOrgAdmins(payload: { organizationId: string; actorUserId: string }): OrgAdmin[] {
    this.assertOrgAdmin(payload.organizationId, payload.actorUserId);
    return [...(this.adminsByOrg.get(payload.organizationId) ?? [])].sort(
      (left, right) => roleRank[right.role] - roleRank[left.role]
    );
  }

  isOrgAdmin(organizationId: string, userId: string): boolean {
    const admins = this.adminsByOrg.get(organizationId) ?? [];
    return admins.some((admin) => admin.userId === userId);
  }

  addOrgAdmin(payload: {
    organizationId: string;
    actorUserId: string;
    targetUserId: string;
    role?: OrgAdmin['role'];
    nowIso?: string;
  }): OrgAdmin {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const actor = this.requireAdmin(payload.organizationId, payload.actorUserId);
    if (actor.role !== 'owner') {
      throw new Error('Only organization owner can add org admins.');
    }

    const admins = this.adminsByOrg.get(payload.organizationId) ?? [];
    const existing = admins.find((admin) => admin.userId === payload.targetUserId);
    const updated: OrgAdmin = existing
      ? {
          ...existing,
          role: payload.role ?? existing.role,
        }
      : {
          id: makeId('org-admin'),
          organizationId: payload.organizationId,
          userId: payload.targetUserId,
          role: payload.role ?? 'admin',
          createdAtIso: nowIso,
        };

    this.adminsByOrg.set(
      payload.organizationId,
      existing
        ? admins.map((entry) => (entry.userId === payload.targetUserId ? updated : entry))
        : [updated, ...admins]
    );
    this.touchOrganization(payload.organizationId, nowIso);
    return updated;
  }

  addWorkspace(payload: {
    organizationId: string;
    actorUserId: string;
    workspaceId: string;
    nowIso?: string;
  }): Organization {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    this.assertOrgAdmin(payload.organizationId, payload.actorUserId);
    const organization = this.organizations.get(payload.organizationId);
    if (!organization) throw new Error(`Organization ${payload.organizationId} not found.`);

    if (this.orgByWorkspaceId.has(payload.workspaceId)) {
      const existingOrg = this.orgByWorkspaceId.get(payload.workspaceId);
      if (existingOrg !== payload.organizationId) {
        throw new Error(`Workspace ${payload.workspaceId} already belongs to another organization.`);
      }
    }

    if (!organization.workspaceIds.includes(payload.workspaceId)) {
      organization.workspaceIds.push(payload.workspaceId);
      organization.updatedAtIso = nowIso;
      this.organizations.set(payload.organizationId, organization);
      this.orgByWorkspaceId.set(payload.workspaceId, payload.organizationId);
    }

    return {
      ...organization,
      workspaceIds: [...organization.workspaceIds],
    };
  }

  removeWorkspace(payload: {
    organizationId: string;
    actorUserId: string;
    workspaceId: string;
    nowIso?: string;
  }): Organization {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    this.assertOrgAdmin(payload.organizationId, payload.actorUserId);
    const organization = this.organizations.get(payload.organizationId);
    if (!organization) throw new Error(`Organization ${payload.organizationId} not found.`);

    organization.workspaceIds = organization.workspaceIds.filter((workspaceId) => workspaceId !== payload.workspaceId);
    organization.updatedAtIso = nowIso;
    this.organizations.set(payload.organizationId, organization);
    if (this.orgByWorkspaceId.get(payload.workspaceId) === payload.organizationId) {
      this.orgByWorkspaceId.delete(payload.workspaceId);
    }

    return {
      ...organization,
      workspaceIds: [...organization.workspaceIds],
    };
  }

  listOrgWorkspaceIds(payload: { organizationId: string; actorUserId: string }): string[] {
    this.assertOrgAdmin(payload.organizationId, payload.actorUserId);
    const organization = this.organizations.get(payload.organizationId);
    if (!organization) throw new Error(`Organization ${payload.organizationId} not found.`);
    return [...organization.workspaceIds];
  }

  updateOrgPolicy(payload: {
    organizationId: string;
    actorUserId: string;
    patch: Partial<OrgPolicy>;
    nowIso?: string;
  }): Organization {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    this.assertOrgAdmin(payload.organizationId, payload.actorUserId);
    const organization = this.organizations.get(payload.organizationId);
    if (!organization) throw new Error(`Organization ${payload.organizationId} not found.`);

    organization.policy = {
      ...organization.policy,
      ...payload.patch,
    };
    organization.updatedAtIso = nowIso;
    this.organizations.set(payload.organizationId, organization);

    return {
      ...organization,
      policy: { ...organization.policy },
      workspaceIds: [...organization.workspaceIds],
    };
  }

  private requireAdmin(organizationId: string, userId: string): OrgAdmin {
    const admin = (this.adminsByOrg.get(organizationId) ?? []).find((entry) => entry.userId === userId);
    if (!admin) {
      throw new Error(`User ${userId} is not an org admin of ${organizationId}.`);
    }
    return admin;
  }

  private assertOrgAdmin(organizationId: string, userId: string): void {
    this.requireAdmin(organizationId, userId);
  }

  private touchOrganization(organizationId: string, nowIso: string): void {
    const organization = this.organizations.get(organizationId);
    if (!organization) return;
    organization.updatedAtIso = nowIso;
    this.organizations.set(organizationId, organization);
  }
}

export const orgManager = new OrgManager();
