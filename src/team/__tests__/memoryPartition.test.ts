import { describe, expect, it } from 'vitest';
import { WorkspaceMemoryPartition, workspaceMemoryNamespace } from '../memoryPartition';

describe('workspace memory partition', () => {
  it('keeps personal memory private and shared memory visible', () => {
    const partition = new WorkspaceMemoryPartition();
    const workspaceId = 'workspace-1';

    const ownerPersonal = partition.createPersonalMemory({
      workspaceId,
      userId: 'owner-1',
      title: 'Owner private note',
      content: 'Only owner should see this.',
    });
    partition.createPersonalMemory({
      workspaceId,
      userId: 'member-1',
      title: 'Member private note',
      content: 'Only member should see this.',
    });

    const ownerVisibleBefore = partition.listVisibleMemories({
      workspaceId,
      userId: 'owner-1',
    });
    const memberVisibleBefore = partition.listVisibleMemories({
      workspaceId,
      userId: 'member-1',
    });

    expect(ownerVisibleBefore.map((memory) => memory.id)).toContain(ownerPersonal.id);
    expect(memberVisibleBefore.map((memory) => memory.id)).not.toContain(ownerPersonal.id);

    const promoted = partition.promotePersonalMemory({
      workspaceId,
      memoryId: ownerPersonal.id,
      actorUserId: 'owner-1',
    });
    expect(promoted.visibility).toBe('shared');

    const memberVisibleAfter = partition.listVisibleMemories({
      workspaceId,
      userId: 'member-1',
    });
    expect(memberVisibleAfter.map((memory) => memory.id)).toContain(promoted.id);
  });

  it('builds deterministic namespace keys for personal and shared memory', () => {
    const personal = workspaceMemoryNamespace({
      workspaceId: 'workspace-77',
      userId: 'member-77',
      visibility: 'personal',
    });
    const shared = workspaceMemoryNamespace({
      workspaceId: 'workspace-77',
      visibility: 'shared',
    });

    expect(personal).toBe('workspace:workspace-77:knowledge:personal:member-77');
    expect(shared).toBe('workspace:workspace-77:knowledge:shared');
  });
});

