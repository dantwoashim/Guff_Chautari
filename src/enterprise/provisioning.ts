import { orgManager, type OrgManager } from './orgManager';
import { workspaceManager, type WorkspaceManager } from '../team/workspaceManager';

interface GroupWorkspaceMapping {
  organizationId: string;
  group: string;
  workspaceIds: string[];
}

interface ProvisioningDependencies {
  orgManager?: Pick<OrgManager, 'getOrganization'>;
  workspaceManager?: Pick<
    WorkspaceManager,
    'inviteMember' | 'respondToInvite' | 'removeMember' | 'listMembers'
  >;
}

const normalizeGroup = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ':');

export class EnterpriseProvisioning {
  private mappings = new Map<string, GroupWorkspaceMapping>();

  constructor(private readonly dependencies: ProvisioningDependencies = {}) {}

  configureGroupMapping(payload: {
    organizationId: string;
    group: string;
    workspaceIds: string[];
  }): GroupWorkspaceMapping {
    const mapping: GroupWorkspaceMapping = {
      organizationId: payload.organizationId,
      group: normalizeGroup(payload.group),
      workspaceIds: [...new Set(payload.workspaceIds)],
    };

    this.mappings.set(this.mappingKey(payload.organizationId, payload.group), mapping);
    return mapping;
  }

  listGroupMappings(organizationId: string): GroupWorkspaceMapping[] {
    return [...this.mappings.values()].filter((mapping) => mapping.organizationId === organizationId);
  }

  provisionFromSsoSession(payload: {
    organizationId: string;
    userId: string;
    email: string;
    groups: string[];
    nowIso?: string;
  }): { joinedWorkspaceIds: string[] } {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const orgManagerRef = this.dependencies.orgManager ?? orgManager;
    const workspaceManagerRef = this.dependencies.workspaceManager ?? workspaceManager;

    const organization = orgManagerRef.getOrganization(payload.organizationId);
    if (!organization) {
      throw new Error(`Organization ${payload.organizationId} not found.`);
    }

    const targetWorkspaceIds = new Set<string>();
    for (const group of payload.groups) {
      const mapping = this.mappings.get(this.mappingKey(payload.organizationId, group));
      if (!mapping) continue;
      for (const workspaceId of mapping.workspaceIds) {
        if (organization.workspaceIds.includes(workspaceId)) {
          targetWorkspaceIds.add(workspaceId);
        }
      }
    }

    const joinedWorkspaceIds: string[] = [];
    for (const workspaceId of targetWorkspaceIds) {
      try {
        const invite = workspaceManagerRef.inviteMember({
          workspaceId,
          email: payload.email,
          role: 'member',
          invitedByUserId: organization.createdByUserId,
          nowIso,
        });
        workspaceManagerRef.respondToInvite({
          inviteId: invite.id,
          responderUserId: payload.userId,
          responderEmail: payload.email,
          decision: 'accept',
          nowIso,
        });
        joinedWorkspaceIds.push(workspaceId);
      } catch {
        // Ignore provisioning conflicts and continue.
      }
    }

    return {
      joinedWorkspaceIds,
    };
  }

  deprovisionUser(payload: {
    organizationId: string;
    userId: string;
    nowIso?: string;
  }): { suspendedWorkspaceIds: string[] } {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const orgManagerRef = this.dependencies.orgManager ?? orgManager;
    const workspaceManagerRef = this.dependencies.workspaceManager ?? workspaceManager;

    const organization = orgManagerRef.getOrganization(payload.organizationId);
    if (!organization) {
      throw new Error(`Organization ${payload.organizationId} not found.`);
    }

    const suspendedWorkspaceIds: string[] = [];

    for (const workspaceId of organization.workspaceIds) {
      try {
        const members = workspaceManagerRef.listMembers(workspaceId);
        const target = members.find((member) => member.userId === payload.userId && !member.removedAtIso);
        if (!target) continue;

        workspaceManagerRef.removeMember({
          workspaceId,
          actorUserId: organization.createdByUserId,
          targetUserId: payload.userId,
          nowIso,
        });
        suspendedWorkspaceIds.push(workspaceId);
      } catch {
        // Ignore per-workspace failures.
      }
    }

    return {
      suspendedWorkspaceIds,
    };
  }

  resetForTests(): void {
    this.mappings.clear();
  }

  private mappingKey(organizationId: string, group: string): string {
    return `${organizationId}::${normalizeGroup(group)}`;
  }
}

export const enterpriseProvisioning = new EnterpriseProvisioning();
