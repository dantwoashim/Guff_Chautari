import { describe, expect, it } from 'vitest';
import {
  WorkspacePermissionMiddleware,
  evaluateWorkspacePermission,
  getWorkspacePermissionsForRole,
} from '../permissions';

describe('workspace permissions', () => {
  it('denies viewer write operations and member admin operations', () => {
    const viewerWrite = evaluateWorkspacePermission({
      workspaceId: 'workspace-1',
      actorUserId: 'viewer-1',
      actorRole: 'viewer',
      action: 'workspace.conversations.write',
    });
    expect(viewerWrite.allowed).toBe(false);

    const memberAdminAction = evaluateWorkspacePermission({
      workspaceId: 'workspace-1',
      actorUserId: 'member-1',
      actorRole: 'member',
      action: 'workspace.members.roles.manage',
      targetUserId: 'viewer-1',
      targetRole: 'viewer',
    });
    expect(memberAdminAction.allowed).toBe(false);
  });

  it('maps owner and admin permissions as expected', () => {
    const ownerPermissions = getWorkspacePermissionsForRole('owner');
    const adminPermissions = getWorkspacePermissionsForRole('admin');

    expect(ownerPermissions).toContain('workspace.billing.manage');
    expect(ownerPermissions).toContain('workspace.delete');
    expect(adminPermissions).not.toContain('workspace.billing.manage');
    expect(adminPermissions).not.toContain('workspace.delete');
    expect(adminPermissions).toContain('workspace.members.invite');
  });

  it('guards operations through middleware', async () => {
    const middleware = new WorkspacePermissionMiddleware({
      resolveActorRole: ({ userId }) => {
        if (userId === 'owner-1') return 'owner';
        if (userId === 'member-1') return 'member';
        return null;
      },
      resolveWorkspaceOwnerUserId: () => 'owner-1',
    });

    await expect(
      middleware.guard(
        {
          workspaceId: 'workspace-1',
          actorUserId: 'owner-1',
          action: 'workspace.members.invite',
          targetRole: 'member',
        },
        async () => 'ok'
      )
    ).resolves.toBe('ok');

    await expect(
      middleware.require({
        workspaceId: 'workspace-1',
        actorUserId: 'member-1',
        action: 'workspace.members.remove',
        targetUserId: 'owner-1',
        targetRole: 'owner',
      })
    ).rejects.toThrow('Role member cannot perform workspace.members.remove.');
  });
});

