import type { OrgManager } from './orgManager';
import { orgManager } from './orgManager';
import type { DataResidencyBinding, DataResidencyZone } from './types';

interface ResidencyDependencies {
  orgManager?: Pick<OrgManager, 'getOrganization'>;
}

export class DataResidencyManager {
  private bindings = new Map<string, DataResidencyBinding>();

  constructor(private readonly dependencies: ResidencyDependencies = {}) {}

  setWorkspaceZone(payload: {
    organizationId: string;
    workspaceId: string;
    zone: DataResidencyZone;
    nowIso?: string;
  }): DataResidencyBinding {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const binding: DataResidencyBinding = {
      organizationId: payload.organizationId,
      workspaceId: payload.workspaceId,
      zone: payload.zone,
      updatedAtIso: nowIso,
    };

    this.bindings.set(this.key(payload.organizationId, payload.workspaceId), binding);
    return binding;
  }

  getWorkspaceZone(payload: { organizationId: string; workspaceId: string }): DataResidencyZone | null {
    return this.bindings.get(this.key(payload.organizationId, payload.workspaceId))?.zone ?? null;
  }

  assertWriteAllowed(payload: {
    organizationId: string;
    workspaceId: string;
    targetZone: DataResidencyZone;
    explicitFederationApproval?: boolean;
  }): { allowed: true; reason: string } {
    const manager = this.dependencies.orgManager ?? orgManager;
    const organization = manager.getOrganization(payload.organizationId);
    if (!organization) {
      throw new Error(`Organization ${payload.organizationId} not found.`);
    }

    const workspaceZone =
      this.getWorkspaceZone({
        organizationId: payload.organizationId,
        workspaceId: payload.workspaceId,
      }) ?? organization.dataResidencyZone;

    if (workspaceZone === payload.targetZone) {
      return {
        allowed: true,
        reason: `Write allowed inside ${workspaceZone} residency zone.`,
      };
    }

    if (!organization.policy.allowCrossZoneFederation) {
      throw new Error(
        `Residency violation: workspace ${payload.workspaceId} is pinned to ${workspaceZone}, cannot write to ${payload.targetZone}.`
      );
    }

    if (!payload.explicitFederationApproval) {
      throw new Error(
        `Cross-zone federation from ${workspaceZone} to ${payload.targetZone} requires explicit admin approval.`
      );
    }

    return {
      allowed: true,
      reason: `Cross-zone write approved from ${workspaceZone} to ${payload.targetZone}.`,
    };
  }

  listBindings(payload: { organizationId: string }): DataResidencyBinding[] {
    return [...this.bindings.values()]
      .filter((binding) => binding.organizationId === payload.organizationId)
      .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
  }

  resetForTests(): void {
    this.bindings.clear();
  }

  private key(organizationId: string, workspaceId: string): string {
    return `${organizationId}::${workspaceId}`;
  }
}

export const dataResidencyManager = new DataResidencyManager();
