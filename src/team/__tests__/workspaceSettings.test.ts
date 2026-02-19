import { describe, expect, it } from 'vitest';
import { TeamKeyRouter } from '../keyRouter';
import { WorkspaceSettingsManager } from '../workspaceSettings';
import { WorkspaceManager } from '../workspaceManager';

describe('workspace settings manager', () => {
  it('updates settings and supports invite-link accept flow', async () => {
    const manager = new WorkspaceManager();
    const keyRouter = new TeamKeyRouter();
    const settingsManager = new WorkspaceSettingsManager({
      workspaceManager: manager,
      teamKeyRouter: keyRouter,
      nowIso: () => '2026-03-05T10:00:00.000Z',
    });

    const created = manager.createWorkspace({
      ownerUserId: 'owner-1',
      name: 'Ops Team',
      nowIso: '2026-03-05T09:00:00.000Z',
    });

    const initial = settingsManager.getSettings({
      workspaceId: created.workspace.id,
      actorUserId: 'owner-1',
    });
    expect(initial.notificationPreferences.workflowFailures).toBe(true);
    expect(initial.apiKeyConfigByProvider.gemini.routingMode).toBe('member_keys_only');

    const updatedNotifications = settingsManager.updateNotificationPreferences({
      workspaceId: created.workspace.id,
      actorUserId: 'owner-1',
      preferences: {
        dailyBriefing: false,
        workflowCompletions: false,
      },
      nowIso: '2026-03-05T10:30:00.000Z',
    });
    expect(updatedNotifications.notificationPreferences.dailyBriefing).toBe(false);
    expect(updatedNotifications.notificationPreferences.workflowCompletions).toBe(false);

    const updatedApiConfig = settingsManager.updateApiKeyConfig({
      workspaceId: created.workspace.id,
      actorUserId: 'owner-1',
      provider: 'gemini',
      routingMode: 'workspace_default_key',
      allowPersonalFallback: true,
      workspaceDefaultKey: 'workspace-key-gemini',
      nowIso: '2026-03-05T11:00:00.000Z',
    });
    expect(updatedApiConfig.apiKeyConfigByProvider.gemini.routingMode).toBe('workspace_default_key');
    expect(updatedApiConfig.apiKeyConfigByProvider.gemini.hasWorkspaceDefaultKey).toBe(true);

    const resolved = await keyRouter.resolveChatKey({
      workspaceId: created.workspace.id,
      userId: 'unkeyed-member',
      provider: 'gemini',
    });
    expect(resolved.key).toBe('workspace-key-gemini');
    expect(resolved.source).toBe('workspace_default');

    const inviteResult = settingsManager.generateInviteLink({
      workspaceId: created.workspace.id,
      actorUserId: 'owner-1',
      email: 'new.member@example.com',
      role: 'member',
      baseUrl: 'https://app.test/workspace/join',
      nowIso: '2026-03-05T11:10:00.000Z',
    });
    expect(inviteResult.inviteLink).toContain(`invite=${inviteResult.invite.id}`);

    const accepted = settingsManager.acceptInviteLink({
      inviteLink: inviteResult.inviteLink,
      actorUserId: 'member-2',
      actorEmail: 'new.member@example.com',
      nowIso: '2026-03-05T11:20:00.000Z',
    });
    expect(accepted.invite.status).toBe('accepted');
    expect(manager.getMemberRole(created.workspace.id, 'member-2')).toBe('member');
  });

  it('enforces workspace settings permissions', () => {
    const manager = new WorkspaceManager();
    const settingsManager = new WorkspaceSettingsManager({
      workspaceManager: manager,
      teamKeyRouter: new TeamKeyRouter(),
    });

    const created = manager.createWorkspace({
      ownerUserId: 'owner-1',
      name: 'Core Team',
      nowIso: '2026-03-05T09:00:00.000Z',
    });
    const invite = manager.inviteMember({
      workspaceId: created.workspace.id,
      email: 'member@example.com',
      role: 'member',
      invitedByUserId: 'owner-1',
      nowIso: '2026-03-05T09:10:00.000Z',
    });
    manager.respondToInvite({
      inviteId: invite.id,
      responderUserId: 'member-1',
      responderEmail: 'member@example.com',
      decision: 'accept',
      nowIso: '2026-03-05T09:20:00.000Z',
    });

    expect(() =>
      settingsManager.updateNotificationPreferences({
        workspaceId: created.workspace.id,
        actorUserId: 'member-1',
        preferences: {
          mentions: false,
        },
      })
    ).toThrow('Role member cannot perform workspace.settings.manage.');
  });
});
