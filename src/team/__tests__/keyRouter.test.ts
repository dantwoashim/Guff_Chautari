import { describe, expect, it } from 'vitest';
import { TeamKeyRouter } from '../keyRouter';

describe('team key router', () => {
  it('uses owner key for workflow runs and member key for chat', async () => {
    const router = new TeamKeyRouter();
    const workspaceId = 'workspace-1';

    router.setWorkspaceMemberKey({
      workspaceId,
      userId: 'owner-1',
      provider: 'gemini',
      apiKey: 'owner-gemini-key',
    });
    router.setWorkspaceMemberKey({
      workspaceId,
      userId: 'member-1',
      provider: 'gemini',
      apiKey: 'member-gemini-key',
    });

    const workflowKey = await router.resolveWorkflowKey({
      workspaceId,
      workflowOwnerUserId: 'owner-1',
      initiatorUserId: 'member-1',
      provider: 'gemini',
    });
    expect(workflowKey.key).toBe('owner-gemini-key');
    expect(workflowKey.resolvedForUserId).toBe('owner-1');

    const initiatorWorkflowKey = await router.resolveWorkflowKey({
      workspaceId,
      workflowOwnerUserId: 'owner-1',
      initiatorUserId: 'member-1',
      provider: 'gemini',
      useInitiatorKey: true,
    });
    expect(initiatorWorkflowKey.key).toBe('member-gemini-key');
    expect(initiatorWorkflowKey.resolvedForUserId).toBe('member-1');

    const chatKey = await router.resolveChatKey({
      workspaceId,
      userId: 'member-1',
      provider: 'gemini',
    });
    expect(chatKey.key).toBe('member-gemini-key');
    expect(chatKey.source).toBe('workspace_member');
  });

  it('falls back to workspace default key when member key is missing', async () => {
    const router = new TeamKeyRouter();
    const workspaceId = 'workspace-2';

    router.setWorkspaceDefaultKey({
      workspaceId,
      provider: 'gemini',
      apiKey: 'workspace-default-key',
    });

    const chatKey = await router.resolveChatKey({
      workspaceId,
      userId: 'member-2',
      provider: 'gemini',
    });

    expect(chatKey.key).toBe('workspace-default-key');
    expect(chatKey.source).toBe('workspace_default');
    expect(router.hasWorkspaceDefaultKey({ workspaceId, provider: 'gemini' })).toBe(true);

    router.removeWorkspaceDefaultKey({ workspaceId, provider: 'gemini' });
    expect(router.hasWorkspaceDefaultKey({ workspaceId, provider: 'gemini' })).toBe(false);
  });
});
