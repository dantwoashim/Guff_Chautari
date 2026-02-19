import React, { useEffect, useMemo, useState } from 'react';
import type { WorkspaceRole } from '../../team/types';
import { workspaceManager } from '../../team/workspaceManager';
import { workspaceSettingsManager } from '../../team/workspaceSettings';

interface WorkspaceSettingsPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const formatTimestamp = (iso?: string): string => {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString();
};

export const WorkspaceSettingsPanel: React.FC<WorkspaceSettingsPanelProps> = ({ userId }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [workspaceNameInput, setWorkspaceNameInput] = useState('Team Workspace');
  const [status, setStatus] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('member');
  const [generatedInviteLink, setGeneratedInviteLink] = useState('');
  const [acceptInviteLinkValue, setAcceptInviteLinkValue] = useState('');
  const [acceptInviteEmail, setAcceptInviteEmail] = useState('');

  const [roleDraftByUserId, setRoleDraftByUserId] = useState<Record<string, WorkspaceRole>>({});

  const [notificationWorkflowFailures, setNotificationWorkflowFailures] = useState(true);
  const [notificationWorkflowCompletions, setNotificationWorkflowCompletions] = useState(true);
  const [notificationDailyBriefing, setNotificationDailyBriefing] = useState(true);
  const [notificationMentions, setNotificationMentions] = useState(true);

  const [apiRoutingMode, setApiRoutingMode] = useState<'member_keys_only' | 'workspace_default_key'>(
    'member_keys_only'
  );
  const [apiAllowFallback, setApiAllowFallback] = useState(true);
  const [workspaceDefaultKeyInput, setWorkspaceDefaultKeyInput] = useState('');
  const [workspaceDefaultKeyConfigured, setWorkspaceDefaultKeyConfigured] = useState(false);
  const [apiUpdatedAtIso, setApiUpdatedAtIso] = useState('');

  const [isBusy, setIsBusy] = useState(false);

  const refresh = () => setRefreshTick((tick) => tick + 1);

  const workspaces = useMemo(() => {
    void refreshTick;
    return workspaceManager.listWorkspacesForUser(userId);
  }, [refreshTick, userId]);

  useEffect(() => {
    if (!selectedWorkspaceId && workspaces.length > 0) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
    if (selectedWorkspaceId && !workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(workspaces[0]?.id ?? null);
    }
  }, [selectedWorkspaceId, workspaces]);

  const activeWorkspace = useMemo(() => {
    if (!selectedWorkspaceId) return null;
    return workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  }, [selectedWorkspaceId, workspaces]);

  const actorRole = useMemo(() => {
    if (!activeWorkspace) return null;
    return workspaceManager.getMemberRole(activeWorkspace.id, userId);
  }, [activeWorkspace, userId]);

  const canManageSettings = actorRole === 'owner' || actorRole === 'admin';

  const members = useMemo(() => {
    if (!activeWorkspace) return [];
    void refreshTick;
    try {
      return workspaceSettingsManager.listMembers({
        workspaceId: activeWorkspace.id,
        actorUserId: userId,
      });
    } catch {
      return [];
    }
  }, [activeWorkspace, refreshTick, userId]);

  const invites = useMemo(() => {
    if (!activeWorkspace) return [];
    void refreshTick;
    try {
      return workspaceSettingsManager.listInvites({
        workspaceId: activeWorkspace.id,
        actorUserId: userId,
      });
    } catch {
      return [];
    }
  }, [activeWorkspace, refreshTick, userId]);

  useEffect(() => {
    if (!activeWorkspace) return;
    try {
      const settings = workspaceSettingsManager.getSettings({
        workspaceId: activeWorkspace.id,
        actorUserId: userId,
      });
      setNotificationWorkflowFailures(settings.notificationPreferences.workflowFailures);
      setNotificationWorkflowCompletions(settings.notificationPreferences.workflowCompletions);
      setNotificationDailyBriefing(settings.notificationPreferences.dailyBriefing);
      setNotificationMentions(settings.notificationPreferences.mentions);
      setApiRoutingMode(settings.apiKeyConfigByProvider.gemini.routingMode);
      setApiAllowFallback(settings.apiKeyConfigByProvider.gemini.allowPersonalFallback);
      setWorkspaceDefaultKeyConfigured(settings.apiKeyConfigByProvider.gemini.hasWorkspaceDefaultKey);
      setApiUpdatedAtIso(settings.apiKeyConfigByProvider.gemini.updatedAtIso);
      setWorkspaceDefaultKeyInput('');
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load workspace settings.');
    }
  }, [activeWorkspace, refreshTick, userId]);

  useEffect(() => {
    setRoleDraftByUserId((current) => {
      const nextDrafts: Record<string, WorkspaceRole> = {};
      for (const member of members) {
        nextDrafts[member.userId] = current[member.userId] ?? member.role;
      }
      return nextDrafts;
    });
  }, [members]);

  const handleCreateWorkspace = () => {
    const name = workspaceNameInput.trim();
    if (!name) {
      setStatus('Workspace name is required.');
      return;
    }
    const created = workspaceManager.createWorkspace({
      ownerUserId: userId,
      name,
    });
    setSelectedWorkspaceId(created.workspace.id);
    setStatus(`Created workspace "${created.workspace.name}".`);
    refresh();
  };

  const withWorkspace = async (operation: (workspaceId: string) => Promise<void>): Promise<void> => {
    if (!activeWorkspace) {
      setStatus('Create or select a workspace first.');
      return;
    }
    setIsBusy(true);
    try {
      await operation(activeWorkspace.id);
      refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Operation failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleGenerateInviteLink = async () => {
    await withWorkspace(async (workspaceId) => {
      const generated = workspaceSettingsManager.generateInviteLink({
        workspaceId,
        actorUserId: userId,
        email: inviteEmail,
        role: inviteRole,
      });
      setGeneratedInviteLink(generated.inviteLink);
      setStatus(`Invite link generated for ${generated.invite.email}.`);
    });
  };

  const handleAcceptInviteLink = async () => {
    const link = acceptInviteLinkValue.trim();
    const email = acceptInviteEmail.trim().toLowerCase();
    if (!link || !email) {
      setStatus('Invite link and email are required.');
      return;
    }
    setIsBusy(true);
    try {
      const result = workspaceSettingsManager.acceptInviteLink({
        inviteLink: link,
        actorUserId: userId,
        actorEmail: email,
      });
      setStatus(
        `Joined workspace invite as ${result.member?.role ?? result.invite.role} (${result.invite.workspaceId}).`
      );
      setAcceptInviteLinkValue('');
      refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Invite acceptance failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveNotifications = async () => {
    await withWorkspace(async (workspaceId) => {
      workspaceSettingsManager.updateNotificationPreferences({
        workspaceId,
        actorUserId: userId,
        preferences: {
          workflowFailures: notificationWorkflowFailures,
          workflowCompletions: notificationWorkflowCompletions,
          dailyBriefing: notificationDailyBriefing,
          mentions: notificationMentions,
        },
      });
      setStatus('Notification preferences updated.');
    });
  };

  const handleSaveApiConfig = async () => {
    await withWorkspace(async (workspaceId) => {
      const settings = workspaceSettingsManager.updateApiKeyConfig({
        workspaceId,
        actorUserId: userId,
        provider: 'gemini',
        routingMode: apiRoutingMode,
        allowPersonalFallback: apiAllowFallback,
        workspaceDefaultKey: workspaceDefaultKeyInput,
      });
      const apiConfig = settings.apiKeyConfigByProvider.gemini;
      setWorkspaceDefaultKeyConfigured(apiConfig.hasWorkspaceDefaultKey);
      setApiUpdatedAtIso(apiConfig.updatedAtIso);
      setWorkspaceDefaultKeyInput('');
      setStatus('API key routing configuration saved.');
    });
  };

  const handleUpdateRole = async (targetUserId: string) => {
    const nextRole = roleDraftByUserId[targetUserId];
    if (!nextRole) return;
    await withWorkspace(async (workspaceId) => {
      workspaceSettingsManager.updateMemberRole({
        workspaceId,
        actorUserId: userId,
        targetUserId,
        nextRole,
      });
      setStatus(`Updated role for ${targetUserId} to ${nextRole}.`);
    });
  };

  const handleRemoveMember = async (targetUserId: string) => {
    await withWorkspace(async (workspaceId) => {
      workspaceSettingsManager.removeMember({
        workspaceId,
        actorUserId: userId,
        targetUserId,
      });
      setStatus(`Removed ${targetUserId} from workspace.`);
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Workspace Settings</h2>
            <p className="text-sm text-[#8696a0]">
              Manage roles, invites, team API key routing, and notification preferences.
            </p>
          </div>
          <button
            type="button"
            className="rounded border border-[#4f6f84] px-3 py-1.5 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
            onClick={refresh}
          >
            Refresh
          </button>
        </div>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Workspace</h3>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <div className="flex gap-2">
              <select
                value={selectedWorkspaceId ?? ''}
                onChange={(event) => setSelectedWorkspaceId(event.target.value || null)}
                className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
              >
                {workspaces.length === 0 ? <option value="">No workspace yet</option> : null}
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              <input
                value={workspaceNameInput}
                onChange={(event) => setWorkspaceNameInput(event.target.value)}
                placeholder="New workspace name"
                className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
              />
            </div>
            <button
              type="button"
              className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
              onClick={handleCreateWorkspace}
            >
              Create Workspace
            </button>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Invite Members</h3>
            <div className="space-y-2">
              <div className="grid gap-2 md:grid-cols-[1fr_160px_auto]">
                <input
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="teammate@example.com"
                  className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
                />
                <select
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as WorkspaceRole)}
                  className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
                >
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                  <option value="viewer">viewer</option>
                </select>
                <button
                  type="button"
                  disabled={isBusy || !canManageSettings || !activeWorkspace}
                  className="rounded border border-[#5a8d5f] px-3 py-2 text-xs text-[#bceac1] hover:bg-[#173125] disabled:opacity-60"
                  onClick={() => {
                    void handleGenerateInviteLink();
                  }}
                >
                  Generate Link
                </button>
              </div>
              {generatedInviteLink ? (
                <div className="rounded border border-[#2f4a5a] bg-[#0f1d27] p-2">
                  <div className="text-[11px] text-[#8ea1ab]">Invite Link</div>
                  <div className="break-all text-xs text-[#d7ebf6]">{generatedInviteLink}</div>
                </div>
              ) : null}

              <div className="h-px bg-[#2b3942]" />

              <div className="text-xs text-[#8ea1ab]">Accept invite link</div>
              <input
                value={acceptInviteLinkValue}
                onChange={(event) => setAcceptInviteLinkValue(event.target.value)}
                placeholder="Paste invite link"
                className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
              />
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <input
                  value={acceptInviteEmail}
                  onChange={(event) => setAcceptInviteEmail(event.target.value)}
                  placeholder="Your invite email"
                  className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
                />
                <button
                  type="button"
                  disabled={isBusy}
                  className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140] disabled:opacity-60"
                  onClick={() => {
                    void handleAcceptInviteLink();
                  }}
                >
                  Accept Invite
                </button>
              </div>
            </div>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">API Key Routing (BYOK)</h3>
            <div className="space-y-2">
              <div className="rounded border border-[#2d3942] bg-[#0d151a] p-2 text-xs text-[#8ea1ab]">
                Provider: gemini • Workspace default key: {workspaceDefaultKeyConfigured ? 'configured' : 'not configured'}
              </div>
              <select
                value={apiRoutingMode}
                onChange={(event) =>
                  setApiRoutingMode(event.target.value as 'member_keys_only' | 'workspace_default_key')
                }
                className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
              >
                <option value="member_keys_only">member keys only</option>
                <option value="workspace_default_key">workspace default key</option>
              </select>
              <label className="flex items-center gap-2 text-xs text-[#c7d0d6]">
                <input
                  type="checkbox"
                  checked={apiAllowFallback}
                  onChange={(event) => setApiAllowFallback(event.target.checked)}
                />
                Allow personal fallback if workspace key is unavailable
              </label>
              <input
                value={workspaceDefaultKeyInput}
                onChange={(event) => setWorkspaceDefaultKeyInput(event.target.value)}
                placeholder="Workspace default Gemini key (leave blank to clear)"
                className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
              />
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-[#738892]">Last update: {formatTimestamp(apiUpdatedAtIso)}</div>
                <button
                  type="button"
                  disabled={isBusy || !canManageSettings || !activeWorkspace}
                  className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140] disabled:opacity-60"
                  onClick={() => {
                    void handleSaveApiConfig();
                  }}
                >
                  Save API Config
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Notification Preferences</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-[#c7d0d6]">
                <input
                  type="checkbox"
                  checked={notificationWorkflowFailures}
                  onChange={(event) => setNotificationWorkflowFailures(event.target.checked)}
                />
                Workflow failures
              </label>
              <label className="flex items-center gap-2 text-xs text-[#c7d0d6]">
                <input
                  type="checkbox"
                  checked={notificationWorkflowCompletions}
                  onChange={(event) => setNotificationWorkflowCompletions(event.target.checked)}
                />
                Workflow completions
              </label>
              <label className="flex items-center gap-2 text-xs text-[#c7d0d6]">
                <input
                  type="checkbox"
                  checked={notificationDailyBriefing}
                  onChange={(event) => setNotificationDailyBriefing(event.target.checked)}
                />
                Daily team briefing
              </label>
              <label className="flex items-center gap-2 text-xs text-[#c7d0d6]">
                <input
                  type="checkbox"
                  checked={notificationMentions}
                  onChange={(event) => setNotificationMentions(event.target.checked)}
                />
                Mentions and direct pings
              </label>
              <button
                type="button"
                disabled={isBusy || !canManageSettings || !activeWorkspace}
                className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140] disabled:opacity-60"
                onClick={() => {
                  void handleSaveNotifications();
                }}
              >
                Save Notification Preferences
              </button>
            </div>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Pending Invites</h3>
            <div className="space-y-2">
              {invites.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0d151a] p-2 text-xs text-[#8ea1ab]">
                  No invites found for this workspace.
                </div>
              ) : (
                invites.slice(0, 12).map((invite) => (
                  <article
                    key={invite.id}
                    className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs"
                  >
                    <div className="text-[#e9edef]">{invite.email}</div>
                    <div className="mt-1 text-[11px] text-[#8ea1ab]">
                      role: {invite.role} • status: {invite.status}
                    </div>
                    <div className="mt-1 text-[11px] text-[#6f838d]">
                      created: {formatTimestamp(invite.createdAtIso)}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Members</h3>
          <div className="space-y-2">
            {members.length === 0 ? (
              <div className="rounded border border-[#2d3942] bg-[#0d151a] p-2 text-xs text-[#8ea1ab]">
                No members in this workspace.
              </div>
            ) : (
              members.map((member) => {
                const isOwner = member.role === 'owner';
                const roleOptions: WorkspaceRole[] =
                  actorRole === 'owner'
                    ? ['owner', 'admin', 'member', 'viewer']
                    : ['admin', 'member', 'viewer'];
                return (
                  <article
                    key={member.id}
                    className="grid gap-2 rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs md:grid-cols-[1fr_170px_auto_auto]"
                  >
                    <div>
                      <div className="text-[#e9edef]">{member.userId}</div>
                      <div className="mt-1 text-[11px] text-[#8ea1ab]">
                        joined: {formatTimestamp(member.joinedAtIso)}
                      </div>
                    </div>
                    <select
                      value={roleDraftByUserId[member.userId] ?? member.role}
                      onChange={(event) =>
                        setRoleDraftByUserId((current) => ({
                          ...current,
                          [member.userId]: event.target.value as WorkspaceRole,
                        }))
                      }
                      disabled={!canManageSettings || isOwner || member.userId === userId}
                      className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb] disabled:opacity-60"
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!canManageSettings || isOwner || member.userId === userId || isBusy}
                      className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140] disabled:opacity-60"
                      onClick={() => {
                        void handleUpdateRole(member.userId);
                      }}
                    >
                      Update Role
                    </button>
                    <button
                      type="button"
                      disabled={!canManageSettings || isOwner || member.userId === userId || isBusy}
                      className="rounded border border-[#7d4f4f] px-3 py-2 text-xs text-[#eabcbc] hover:bg-[#351d1d] disabled:opacity-60"
                      onClick={() => {
                        void handleRemoveMember(member.userId);
                      }}
                    >
                      Remove
                    </button>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {status ? (
          <div className="rounded border border-[#2d3942] bg-[#0d151a] px-3 py-2 text-xs text-[#aebec8]">
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default WorkspaceSettingsPanel;
