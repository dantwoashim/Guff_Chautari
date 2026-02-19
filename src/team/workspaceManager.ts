import type { Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceRole } from './types';
import { assertWorkspacePermission } from './permissions';
import { runtimeWorkspaceRepository } from '../data/repositories';
import { isSupabasePersistenceEnabled } from '../runtime/persistenceMode';

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
    .slice(0, 48) || 'workspace';

const namespaceForWorkspace = (workspaceId: string) => ({
  conversations: `workspace:${workspaceId}:conversations`,
  knowledge: `workspace:${workspaceId}:knowledge`,
  workflows: `workspace:${workspaceId}:workflows`,
});

const roleWeight: Record<WorkspaceRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

export class WorkspaceManager {
  private workspaces = new Map<string, Workspace>();
  private membersByWorkspaceId = new Map<string, WorkspaceMember[]>();
  private invitesByWorkspaceId = new Map<string, WorkspaceInvite[]>();
  private hydratedUsers = new Set<string>();

  createWorkspace(payload: {
    ownerUserId: string;
    name: string;
    slug?: string;
    nowIso?: string;
  }): { workspace: Workspace; ownerMember: WorkspaceMember } {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const workspaceId = makeId('workspace');
    const workspace: Workspace = {
      id: workspaceId,
      name: payload.name.trim() || 'Untitled Workspace',
      slug: payload.slug ? slugify(payload.slug) : slugify(payload.name),
      status: 'active',
      createdByUserId: payload.ownerUserId,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      namespace: namespaceForWorkspace(workspaceId),
    };
    this.workspaces.set(workspace.id, workspace);

    const ownerMember: WorkspaceMember = {
      id: makeId('workspace-member'),
      workspaceId: workspace.id,
      userId: payload.ownerUserId,
      role: 'owner',
      joinedAtIso: nowIso,
    };
    this.membersByWorkspaceId.set(workspace.id, [ownerMember]);
    this.invitesByWorkspaceId.set(workspace.id, []);
    this.persistWorkspaceSnapshot(workspace, [ownerMember], []);

    return { workspace, ownerMember };
  }

  listWorkspacesForUser(userId: string): Workspace[] {
    this.hydrateFromRuntime(userId);
    const memberships = [...this.membersByWorkspaceId.values()].flat();
    const workspaceIds = new Set(
      memberships.filter((member) => member.userId === userId && !member.removedAtIso).map((member) => member.workspaceId)
    );
    return [...workspaceIds]
      .map((workspaceId) => this.workspaces.get(workspaceId))
      .filter((workspace): workspace is Workspace => Boolean(workspace))
      .sort((left, right) => Date.parse(right.updatedAtIso) - Date.parse(left.updatedAtIso));
  }

  getWorkspace(workspaceId: string): Workspace | null {
    return this.workspaces.get(workspaceId) ?? null;
  }

  listMembers(workspaceId: string, actorUserId?: string): WorkspaceMember[] {
    const members = this.membersByWorkspaceId.get(workspaceId) ?? [];
    const visibleMembers = members
      .filter((member) => !member.removedAtIso)
      .sort((left, right) => roleWeight[right.role] - roleWeight[left.role]);
    if (!actorUserId) return visibleMembers;

    const actor = visibleMembers.find((member) => member.userId === actorUserId);
    if (!actor) {
      throw new Error(`User ${actorUserId} is not a member of workspace ${workspaceId}.`);
    }
    const workspace = this.workspaces.get(workspaceId);
    assertWorkspacePermission({
      workspaceId,
      actorUserId,
      actorRole: actor.role,
      workspaceOwnerUserId: workspace?.createdByUserId,
      action: 'workspace.members.read',
    });
    return visibleMembers;
  }

  listInvites(workspaceId: string, actorUserId?: string): WorkspaceInvite[] {
    if (actorUserId) {
      const actor = this.listMembers(workspaceId).find((member) => member.userId === actorUserId);
      if (!actor) {
        throw new Error(`User ${actorUserId} is not a member of workspace ${workspaceId}.`);
      }
      const workspace = this.workspaces.get(workspaceId);
      assertWorkspacePermission({
        workspaceId,
        actorUserId,
        actorRole: actor.role,
        workspaceOwnerUserId: workspace?.createdByUserId,
        action: 'workspace.members.read',
      });
    }
    const invites = this.invitesByWorkspaceId.get(workspaceId) ?? [];
    return [...invites].sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso));
  }

  getMemberRole(workspaceId: string, userId: string): WorkspaceRole | null {
    const member = this.listMembers(workspaceId).find((item) => item.userId === userId);
    return member?.role ?? null;
  }

  inviteMember(payload: {
    workspaceId: string;
    email: string;
    role: WorkspaceRole;
    invitedByUserId: string;
    nowIso?: string;
  }): WorkspaceInvite {
    const workspace = this.workspaces.get(payload.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${payload.workspaceId} not found.`);
    }

    const inviter = this.listMembers(payload.workspaceId).find(
      (member) => member.userId === payload.invitedByUserId
    );
    if (!inviter) {
      throw new Error('Only workspace members can invite users.');
    }
    assertWorkspacePermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.invitedByUserId,
      actorRole: inviter.role,
      workspaceOwnerUserId: workspace.createdByUserId,
      action: 'workspace.members.invite',
      targetRole: payload.role,
    });

    const normalizedEmail = payload.email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('Invite email is required.');
    }

    const nowIso = payload.nowIso ?? new Date().toISOString();
    const invite: WorkspaceInvite = {
      id: makeId('workspace-invite'),
      workspaceId: payload.workspaceId,
      email: normalizedEmail,
      role: payload.role,
      invitedByUserId: payload.invitedByUserId,
      status: 'pending',
      createdAtIso: nowIso,
    };

    const invites = this.invitesByWorkspaceId.get(payload.workspaceId) ?? [];
    const nextInvites = [invite, ...invites];
    this.invitesByWorkspaceId.set(payload.workspaceId, nextInvites);
    this.touchWorkspace(payload.workspaceId, nowIso);
    const workspaceSnapshot = this.workspaces.get(payload.workspaceId);
    if (workspaceSnapshot) {
      const members = this.membersByWorkspaceId.get(payload.workspaceId) ?? [];
      this.persistWorkspaceSnapshot(workspaceSnapshot, members, nextInvites);
    }
    return invite;
  }

  respondToInvite(payload: {
    inviteId: string;
    responderUserId: string;
    responderEmail: string;
    decision: 'accept' | 'reject';
    nowIso?: string;
  }): { invite: WorkspaceInvite; member?: WorkspaceMember } {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const normalizedEmail = payload.responderEmail.trim().toLowerCase();

    for (const [workspaceId, invites] of this.invitesByWorkspaceId.entries()) {
      const index = invites.findIndex((invite) => invite.id === payload.inviteId);
      if (index === -1) continue;

      const invite = invites[index];
      if (invite.status !== 'pending') {
        throw new Error(`Invite ${payload.inviteId} is already ${invite.status}.`);
      }
      if (invite.email !== normalizedEmail) {
        throw new Error('Invite email mismatch.');
      }

      const resolvedInvite: WorkspaceInvite = {
        ...invite,
        status: payload.decision === 'accept' ? 'accepted' : 'rejected',
        respondedAtIso: nowIso,
        responderUserId: payload.responderUserId,
      };
      const nextInvites = [...invites];
      nextInvites[index] = resolvedInvite;
      this.invitesByWorkspaceId.set(workspaceId, nextInvites);

      if (payload.decision === 'reject') {
        this.touchWorkspace(workspaceId, nowIso);
        const workspace = this.workspaces.get(workspaceId);
        if (workspace) {
          const members = this.membersByWorkspaceId.get(workspaceId) ?? [];
          this.persistWorkspaceSnapshot(workspace, members, nextInvites);
        }
        return { invite: resolvedInvite };
      }

      const members = this.membersByWorkspaceId.get(workspaceId) ?? [];
      const existing = members.find((member) => member.userId === payload.responderUserId);
      const nextMember: WorkspaceMember = existing
        ? {
            ...existing,
            role: resolvedInvite.role,
            removedAtIso: undefined,
          }
        : {
            id: makeId('workspace-member'),
            workspaceId,
            userId: payload.responderUserId,
            role: resolvedInvite.role,
            joinedAtIso: nowIso,
            invitedByUserId: resolvedInvite.invitedByUserId,
          };

      const nextMembers = existing
        ? members.map((member) => (member.userId === nextMember.userId ? nextMember : member))
        : [nextMember, ...members];
      this.membersByWorkspaceId.set(workspaceId, nextMembers);
      this.touchWorkspace(workspaceId, nowIso);
      const workspace = this.workspaces.get(workspaceId);
      if (workspace) {
        this.persistWorkspaceSnapshot(workspace, nextMembers, nextInvites);
      }
      return {
        invite: resolvedInvite,
        member: nextMember,
      };
    }

    throw new Error(`Invite ${payload.inviteId} not found.`);
  }

  removeMember(payload: {
    workspaceId: string;
    actorUserId: string;
    targetUserId: string;
    nowIso?: string;
  }): WorkspaceMember {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const members = this.membersByWorkspaceId.get(payload.workspaceId) ?? [];
    const actor = members.find((member) => member.userId === payload.actorUserId && !member.removedAtIso);
    if (!actor) {
      throw new Error('Only workspace members can remove members.');
    }

    const target = members.find((member) => member.userId === payload.targetUserId && !member.removedAtIso);
    if (!target) {
      throw new Error(`Member ${payload.targetUserId} not found.`);
    }

    const workspace = this.workspaces.get(payload.workspaceId);
    assertWorkspacePermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      actorRole: actor.role,
      workspaceOwnerUserId: workspace?.createdByUserId,
      action: 'workspace.members.remove',
      targetUserId: target.userId,
      targetRole: target.role,
    });

    const removed = {
      ...target,
      removedAtIso: nowIso,
    };
    this.membersByWorkspaceId.set(
      payload.workspaceId,
      members.map((member) => (member.userId === payload.targetUserId ? removed : member))
    );
    this.touchWorkspace(payload.workspaceId, nowIso);
    const workspaceSnapshot = this.workspaces.get(payload.workspaceId);
    if (workspaceSnapshot) {
      const nextMembers = this.membersByWorkspaceId.get(payload.workspaceId) ?? [];
      const invites = this.invitesByWorkspaceId.get(payload.workspaceId) ?? [];
      this.persistWorkspaceSnapshot(workspaceSnapshot, nextMembers, invites);
    }
    return removed;
  }

  updateMemberRole(payload: {
    workspaceId: string;
    actorUserId: string;
    targetUserId: string;
    nextRole: WorkspaceRole;
    nowIso?: string;
  }): WorkspaceMember {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const members = this.membersByWorkspaceId.get(payload.workspaceId) ?? [];
    const actor = members.find((member) => member.userId === payload.actorUserId && !member.removedAtIso);
    if (!actor) {
      throw new Error('Only workspace members can update roles.');
    }

    const target = members.find((member) => member.userId === payload.targetUserId && !member.removedAtIso);
    if (!target) {
      throw new Error(`Member ${payload.targetUserId} not found.`);
    }

    const workspace = this.workspaces.get(payload.workspaceId);
    assertWorkspacePermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      actorRole: actor.role,
      workspaceOwnerUserId: workspace?.createdByUserId,
      action: 'workspace.members.roles.manage',
      targetUserId: target.userId,
      targetRole: target.role,
    });
    if (payload.nextRole === 'owner' && actor.role !== 'owner') {
      throw new Error('Only owner can assign owner role.');
    }

    const updated: WorkspaceMember = {
      ...target,
      role: payload.nextRole,
    };
    this.membersByWorkspaceId.set(
      payload.workspaceId,
      members.map((member) => (member.userId === payload.targetUserId ? updated : member))
    );
    this.touchWorkspace(payload.workspaceId, nowIso);
    const workspaceUpdated = this.workspaces.get(payload.workspaceId);
    if (workspaceUpdated) {
      const nextMembers = this.membersByWorkspaceId.get(payload.workspaceId) ?? [];
      const invites = this.invitesByWorkspaceId.get(payload.workspaceId) ?? [];
      this.persistWorkspaceSnapshot(workspaceUpdated, nextMembers, invites);
    }
    return updated;
  }

  private touchWorkspace(workspaceId: string, updatedAtIso: string): void {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return;
    const nextWorkspace = {
      ...workspace,
      updatedAtIso,
    };
    this.workspaces.set(workspaceId, nextWorkspace);
    const members = this.membersByWorkspaceId.get(workspaceId) ?? [];
    const invites = this.invitesByWorkspaceId.get(workspaceId) ?? [];
    this.persistWorkspaceSnapshot(nextWorkspace, members, invites);
  }

  private persistWorkspaceSnapshot(
    workspace: Workspace,
    members: WorkspaceMember[],
    invites: WorkspaceInvite[]
  ): void {
    if (!isSupabasePersistenceEnabled()) return;
    const ownerUserId = workspace.createdByUserId;

    void runtimeWorkspaceRepository.upsertWorkspace({
      userId: ownerUserId,
      workspaceId: workspace.id,
      state: { workspace },
      schemaVersion: 1,
      version: 1,
    });

    for (const member of members) {
      void runtimeWorkspaceRepository.upsertMember({
        userId: ownerUserId,
        workspaceId: workspace.id,
        memberUserId: member.userId,
        role: member.role,
        state: { member },
        schemaVersion: 1,
        version: 1,
      });
    }

    for (const invite of invites) {
      void runtimeWorkspaceRepository.upsertInvite({
        userId: ownerUserId,
        workspaceId: workspace.id,
        inviteId: invite.id,
        status: invite.status,
        state: { invite },
        schemaVersion: 1,
        version: 1,
      });
    }
  }

  private hydrateFromRuntime(userId: string): void {
    if (!isSupabasePersistenceEnabled()) return;
    if (this.hydratedUsers.has(userId)) return;
    this.hydratedUsers.add(userId);

    void runtimeWorkspaceRepository
      .listWorkspaces(userId)
      .then((snapshots) => {
        for (const snapshot of snapshots) {
          const workspaceCandidate = snapshot.payload.workspace;
          if (!workspaceCandidate || typeof workspaceCandidate !== 'object') continue;
          this.workspaces.set(snapshot.workspaceId, workspaceCandidate as Workspace);
        }

        for (const snapshot of snapshots) {
          void runtimeWorkspaceRepository
            .listMembers(userId, snapshot.workspaceId)
            .then((members) => {
              const normalized = members
                .map((entry) => entry.payload.member)
                .filter((entry): entry is WorkspaceMember => Boolean(entry))
                .filter((entry) => typeof entry === 'object');
              if (normalized.length > 0) {
                this.membersByWorkspaceId.set(snapshot.workspaceId, normalized);
              }
            })
            .catch(() => {
              // Ignore hydration failure and keep current state.
            });

          void runtimeWorkspaceRepository
            .listInvites(userId, snapshot.workspaceId)
            .then((invites) => {
              const normalized = invites
                .map((entry) => entry.payload.invite)
                .filter((entry): entry is WorkspaceInvite => Boolean(entry))
                .filter((entry) => typeof entry === 'object');
              if (normalized.length > 0) {
                this.invitesByWorkspaceId.set(snapshot.workspaceId, normalized);
              }
            })
            .catch(() => {
              // Ignore hydration failure and keep current state.
            });
        }
      })
      .catch(() => {
        // Ignore hydration failure and keep current state.
      });
  }
}

export const workspaceManager = new WorkspaceManager();
