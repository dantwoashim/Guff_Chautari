import { describe, expect, it } from 'vitest';
import { WorkspaceManager } from '../workspaceManager';

describe('workspaceManager', () => {
  it('creates workspace, invites members, and accepts invites', () => {
    const manager = new WorkspaceManager();
    const ownerUserId = 'owner-user-1';

    const created = manager.createWorkspace({
      ownerUserId,
      name: 'Core Team',
      nowIso: '2026-02-17T00:00:00.000Z',
    });

    expect(created.workspace.namespace.conversations).toContain(created.workspace.id);
    expect(manager.listMembers(created.workspace.id)).toHaveLength(1);

    const inviteA = manager.inviteMember({
      workspaceId: created.workspace.id,
      email: 'a@example.com',
      role: 'member',
      invitedByUserId: ownerUserId,
      nowIso: '2026-02-17T00:10:00.000Z',
    });
    const inviteB = manager.inviteMember({
      workspaceId: created.workspace.id,
      email: 'b@example.com',
      role: 'admin',
      invitedByUserId: ownerUserId,
      nowIso: '2026-02-17T00:11:00.000Z',
    });
    const inviteC = manager.inviteMember({
      workspaceId: created.workspace.id,
      email: 'c@example.com',
      role: 'viewer',
      invitedByUserId: ownerUserId,
      nowIso: '2026-02-17T00:12:00.000Z',
    });

    manager.respondToInvite({
      inviteId: inviteA.id,
      responderUserId: 'member-a',
      responderEmail: 'a@example.com',
      decision: 'accept',
      nowIso: '2026-02-17T00:20:00.000Z',
    });
    manager.respondToInvite({
      inviteId: inviteB.id,
      responderUserId: 'member-b',
      responderEmail: 'b@example.com',
      decision: 'accept',
      nowIso: '2026-02-17T00:21:00.000Z',
    });
    manager.respondToInvite({
      inviteId: inviteC.id,
      responderUserId: 'member-c',
      responderEmail: 'c@example.com',
      decision: 'accept',
      nowIso: '2026-02-17T00:22:00.000Z',
    });

    const members = manager.listMembers(created.workspace.id);
    expect(members).toHaveLength(4);
    expect(members.map((member) => member.userId).sort()).toEqual([
      'member-a',
      'member-b',
      'member-c',
      'owner-user-1',
    ]);
  });

  it('enforces workspace role permissions for member actions', () => {
    const manager = new WorkspaceManager();
    const created = manager.createWorkspace({
      ownerUserId: 'owner-user-1',
      name: 'Core Team',
      nowIso: '2026-02-17T00:00:00.000Z',
    });

    const memberInvite = manager.inviteMember({
      workspaceId: created.workspace.id,
      email: 'member@example.com',
      role: 'member',
      invitedByUserId: 'owner-user-1',
      nowIso: '2026-02-17T00:01:00.000Z',
    });
    const viewerInvite = manager.inviteMember({
      workspaceId: created.workspace.id,
      email: 'viewer@example.com',
      role: 'viewer',
      invitedByUserId: 'owner-user-1',
      nowIso: '2026-02-17T00:02:00.000Z',
    });

    manager.respondToInvite({
      inviteId: memberInvite.id,
      responderUserId: 'member-user-1',
      responderEmail: 'member@example.com',
      decision: 'accept',
      nowIso: '2026-02-17T00:03:00.000Z',
    });
    manager.respondToInvite({
      inviteId: viewerInvite.id,
      responderUserId: 'viewer-user-1',
      responderEmail: 'viewer@example.com',
      decision: 'accept',
      nowIso: '2026-02-17T00:04:00.000Z',
    });

    expect(() =>
      manager.inviteMember({
        workspaceId: created.workspace.id,
        email: 'blocked@example.com',
        role: 'member',
        invitedByUserId: 'viewer-user-1',
      })
    ).toThrow('Role viewer cannot perform workspace.members.invite.');

    expect(() =>
      manager.updateMemberRole({
        workspaceId: created.workspace.id,
        actorUserId: 'member-user-1',
        targetUserId: 'viewer-user-1',
        nextRole: 'admin',
      })
    ).toThrow('Role member cannot perform workspace.members.roles.manage.');
  });
});
