import { describe, expect, it } from 'vitest';
import { createWorkspaceStore } from '../store';

describe('workspace store', () => {
  it('keeps members and invites isolated per workspace', () => {
    const store = createWorkspaceStore();
    const state = store.getState();

    state.upsertWorkspace({
      id: 'workspace-a',
      name: 'Workspace A',
      slug: 'workspace-a',
      status: 'active',
      createdByUserId: 'owner-a',
      createdAtIso: '2026-02-17T00:00:00.000Z',
      updatedAtIso: '2026-02-17T00:00:00.000Z',
      namespace: {
        conversations: 'workspace:workspace-a:conversations',
        knowledge: 'workspace:workspace-a:knowledge',
        workflows: 'workspace:workspace-a:workflows',
      },
    });
    state.upsertWorkspace({
      id: 'workspace-b',
      name: 'Workspace B',
      slug: 'workspace-b',
      status: 'active',
      createdByUserId: 'owner-b',
      createdAtIso: '2026-02-17T00:00:00.000Z',
      updatedAtIso: '2026-02-17T00:00:00.000Z',
      namespace: {
        conversations: 'workspace:workspace-b:conversations',
        knowledge: 'workspace:workspace-b:knowledge',
        workflows: 'workspace:workspace-b:workflows',
      },
    });

    state.setMembers('workspace-a', [
      {
        id: 'member-a-owner',
        workspaceId: 'workspace-a',
        userId: 'owner-a',
        role: 'owner',
        joinedAtIso: '2026-02-17T00:00:00.000Z',
      },
    ]);
    state.setMembers('workspace-b', [
      {
        id: 'member-b-owner',
        workspaceId: 'workspace-b',
        userId: 'owner-b',
        role: 'owner',
        joinedAtIso: '2026-02-17T00:00:00.000Z',
      },
      {
        id: 'member-b-1',
        workspaceId: 'workspace-b',
        userId: 'member-b-1',
        role: 'member',
        joinedAtIso: '2026-02-17T00:01:00.000Z',
      },
    ]);

    state.upsertInvite({
      id: 'invite-a-1',
      workspaceId: 'workspace-a',
      email: 'invite-a@example.com',
      role: 'member',
      invitedByUserId: 'owner-a',
      status: 'pending',
      createdAtIso: '2026-02-17T01:00:00.000Z',
    });
    state.upsertInvite({
      id: 'invite-b-1',
      workspaceId: 'workspace-b',
      email: 'invite-b@example.com',
      role: 'viewer',
      invitedByUserId: 'owner-b',
      status: 'pending',
      createdAtIso: '2026-02-17T01:00:00.000Z',
    });

    expect(store.getState().membersByWorkspaceId['workspace-a']).toHaveLength(1);
    expect(store.getState().membersByWorkspaceId['workspace-b']).toHaveLength(2);
    expect(store.getState().pendingInvitesByWorkspaceId['workspace-a']).toHaveLength(1);
    expect(store.getState().pendingInvitesByWorkspaceId['workspace-b']).toHaveLength(1);

    state.removeMember('workspace-b', 'member-b-1');
    expect(store.getState().membersByWorkspaceId['workspace-a']).toHaveLength(1);
    expect(store.getState().membersByWorkspaceId['workspace-b']).toHaveLength(1);
  });
});
