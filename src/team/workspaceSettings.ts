import { BYOK_PROVIDERS, type BYOKProvider } from '../byok';
import { assertWorkspacePermission } from './permissions';
import { teamKeyRouter, type TeamKeyRouter } from './keyRouter';
import type {
  WorkspaceApiKeyConfig,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceNotificationPreferences,
  WorkspaceRole,
  WorkspaceSettingsRecord,
} from './types';
import { workspaceManager, type WorkspaceManager } from './workspaceManager';

const DEFAULT_INVITE_BASE_URL = 'https://app.ashim.ai/workspace/join';

const defaultNotificationPreferences = (): WorkspaceNotificationPreferences => ({
  workflowFailures: true,
  workflowCompletions: true,
  dailyBriefing: true,
  mentions: true,
});

const cloneSettings = (settings: WorkspaceSettingsRecord): WorkspaceSettingsRecord => ({
  ...settings,
  notificationPreferences: {
    ...settings.notificationPreferences,
  },
  apiKeyConfigByProvider: Object.fromEntries(
    Object.entries(settings.apiKeyConfigByProvider).map(([provider, config]) => [
      provider,
      { ...config },
    ])
  ) as WorkspaceSettingsRecord['apiKeyConfigByProvider'],
});

const parseInviteToken = (inviteLink: string): { inviteId: string; workspaceId?: string } => {
  const trimmed = inviteLink.trim();
  if (!trimmed) {
    throw new Error('Invite link is required.');
  }

  const queryStart = trimmed.indexOf('?');
  const query = queryStart >= 0 ? trimmed.slice(queryStart + 1) : trimmed;
  const params = new URLSearchParams(query);
  const inviteId = (params.get('invite') ?? params.get('inviteId') ?? '').trim();
  if (!inviteId) {
    throw new Error('Invite link missing invite token.');
  }

  const workspaceId = params.get('workspace')?.trim() || undefined;
  return {
    inviteId,
    workspaceId,
  };
};

interface WorkspaceSettingsManagerOptions {
  workspaceManager?: WorkspaceManagerDependency;
  teamKeyRouter?: TeamKeyRouterDependency;
  nowIso?: () => string;
}

type WorkspaceManagerDependency = Pick<
  WorkspaceManager,
  | 'getWorkspace'
  | 'getMemberRole'
  | 'inviteMember'
  | 'respondToInvite'
  | 'listMembers'
  | 'listInvites'
  | 'updateMemberRole'
  | 'removeMember'
>;

type TeamKeyRouterDependency = Pick<
  TeamKeyRouter,
  'setWorkspaceDefaultKey' | 'removeWorkspaceDefaultKey' | 'hasWorkspaceDefaultKey'
>;

export class WorkspaceSettingsManager {
  private readonly workspaceManager: WorkspaceManagerDependency;
  private readonly keyRouter: TeamKeyRouterDependency;
  private readonly nowIso: () => string;
  private readonly settingsByWorkspaceId = new Map<string, WorkspaceSettingsRecord>();

  constructor(options: WorkspaceSettingsManagerOptions = {}) {
    this.workspaceManager = options.workspaceManager ?? workspaceManager;
    this.keyRouter = options.teamKeyRouter ?? teamKeyRouter;
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
  }

  getSettings(payload: {
    workspaceId: string;
    actorUserId: string;
  }): WorkspaceSettingsRecord {
    this.assertPermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      action: 'workspace.read',
    });
    return this.ensureSettings(payload.workspaceId, payload.actorUserId);
  }

  updateNotificationPreferences(payload: {
    workspaceId: string;
    actorUserId: string;
    preferences: Partial<WorkspaceNotificationPreferences>;
    nowIso?: string;
  }): WorkspaceSettingsRecord {
    this.assertPermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      action: 'workspace.settings.manage',
    });
    const nowIso = payload.nowIso ?? this.nowIso();
    const current = this.ensureSettings(payload.workspaceId, payload.actorUserId, nowIso);
    const next: WorkspaceSettingsRecord = {
      ...current,
      notificationPreferences: {
        ...current.notificationPreferences,
        ...payload.preferences,
      },
      updatedAtIso: nowIso,
      updatedByUserId: payload.actorUserId,
    };
    this.settingsByWorkspaceId.set(payload.workspaceId, next);
    return cloneSettings(next);
  }

  updateApiKeyConfig(payload: {
    workspaceId: string;
    actorUserId: string;
    provider: BYOKProvider;
    routingMode: WorkspaceApiKeyConfig['routingMode'];
    allowPersonalFallback: boolean;
    workspaceDefaultKey?: string;
    nowIso?: string;
  }): WorkspaceSettingsRecord {
    this.assertPermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      action: 'workspace.settings.manage',
    });

    const nowIso = payload.nowIso ?? this.nowIso();
    const current = this.ensureSettings(payload.workspaceId, payload.actorUserId, nowIso);

    if (payload.workspaceDefaultKey !== undefined) {
      const normalized = payload.workspaceDefaultKey.trim();
      if (normalized.length === 0) {
        this.keyRouter.removeWorkspaceDefaultKey({
          workspaceId: payload.workspaceId,
          provider: payload.provider,
        });
      } else {
        this.keyRouter.setWorkspaceDefaultKey({
          workspaceId: payload.workspaceId,
          provider: payload.provider,
          apiKey: normalized,
        });
      }
    }

    const hasWorkspaceDefaultKey = this.keyRouter.hasWorkspaceDefaultKey({
      workspaceId: payload.workspaceId,
      provider: payload.provider,
    });
    if (
      payload.routingMode === 'workspace_default_key' &&
      !hasWorkspaceDefaultKey &&
      !payload.allowPersonalFallback
    ) {
      throw new Error(
        'Workspace default key mode requires a workspace key or personal fallback enabled.'
      );
    }

    const next: WorkspaceSettingsRecord = {
      ...current,
      apiKeyConfigByProvider: {
        ...current.apiKeyConfigByProvider,
        [payload.provider]: {
          provider: payload.provider,
          routingMode: payload.routingMode,
          allowPersonalFallback: payload.allowPersonalFallback,
          hasWorkspaceDefaultKey,
          updatedAtIso: nowIso,
          updatedByUserId: payload.actorUserId,
        },
      },
      updatedAtIso: nowIso,
      updatedByUserId: payload.actorUserId,
    };
    this.settingsByWorkspaceId.set(payload.workspaceId, next);
    return cloneSettings(next);
  }

  generateInviteLink(payload: {
    workspaceId: string;
    actorUserId: string;
    email: string;
    role: WorkspaceRole;
    baseUrl?: string;
    nowIso?: string;
  }): { invite: WorkspaceInvite; inviteLink: string } {
    const invite = this.workspaceManager.inviteMember({
      workspaceId: payload.workspaceId,
      email: payload.email,
      role: payload.role,
      invitedByUserId: payload.actorUserId,
      nowIso: payload.nowIso,
    });

    const base = (payload.baseUrl ?? DEFAULT_INVITE_BASE_URL).trim();
    const params = new URLSearchParams({
      invite: invite.id,
      workspace: invite.workspaceId,
      email: invite.email,
      role: invite.role,
    });
    const inviteLink = `${base}${base.includes('?') ? '&' : '?'}${params.toString()}`;

    return {
      invite,
      inviteLink,
    };
  }

  acceptInviteLink(payload: {
    inviteLink: string;
    actorUserId: string;
    actorEmail: string;
    nowIso?: string;
  }): { invite: WorkspaceInvite; member?: WorkspaceMember } {
    const token = parseInviteToken(payload.inviteLink);
    const result = this.workspaceManager.respondToInvite({
      inviteId: token.inviteId,
      responderUserId: payload.actorUserId,
      responderEmail: payload.actorEmail,
      decision: 'accept',
      nowIso: payload.nowIso,
    });

    if (token.workspaceId && token.workspaceId !== result.invite.workspaceId) {
      throw new Error('Invite link workspace mismatch.');
    }

    return result;
  }

  listMembers(payload: { workspaceId: string; actorUserId: string }): WorkspaceMember[] {
    return this.workspaceManager.listMembers(payload.workspaceId, payload.actorUserId);
  }

  listInvites(payload: { workspaceId: string; actorUserId: string }): WorkspaceInvite[] {
    return this.workspaceManager.listInvites(payload.workspaceId, payload.actorUserId);
  }

  updateMemberRole(payload: {
    workspaceId: string;
    actorUserId: string;
    targetUserId: string;
    nextRole: WorkspaceRole;
    nowIso?: string;
  }): WorkspaceMember {
    return this.workspaceManager.updateMemberRole(payload);
  }

  removeMember(payload: {
    workspaceId: string;
    actorUserId: string;
    targetUserId: string;
    nowIso?: string;
  }): WorkspaceMember {
    return this.workspaceManager.removeMember(payload);
  }

  private ensureSettings(
    workspaceId: string,
    actorUserId: string,
    nowIso?: string
  ): WorkspaceSettingsRecord {
    const existing = this.settingsByWorkspaceId.get(workspaceId);
    if (existing) return cloneSettings(existing);

    const createdAtIso = nowIso ?? this.nowIso();
    const apiKeyConfigByProvider = Object.fromEntries(
      BYOK_PROVIDERS.map((provider) => [
        provider,
        {
          provider,
          routingMode: 'member_keys_only' as const,
          allowPersonalFallback: true,
          hasWorkspaceDefaultKey: this.keyRouter.hasWorkspaceDefaultKey({
            workspaceId,
            provider,
          }),
          updatedAtIso: createdAtIso,
          updatedByUserId: actorUserId,
        },
      ])
    ) as WorkspaceSettingsRecord['apiKeyConfigByProvider'];

    const initial: WorkspaceSettingsRecord = {
      workspaceId,
      notificationPreferences: defaultNotificationPreferences(),
      apiKeyConfigByProvider,
      createdAtIso,
      updatedAtIso: createdAtIso,
      updatedByUserId: actorUserId,
    };
    this.settingsByWorkspaceId.set(workspaceId, initial);
    return cloneSettings(initial);
  }

  private assertPermission(payload: {
    workspaceId: string;
    actorUserId: string;
    action: Parameters<typeof assertWorkspacePermission>[0]['action'];
  }): void {
    const workspace = this.workspaceManager.getWorkspace(payload.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${payload.workspaceId} not found.`);
    }

    const actorRole = this.workspaceManager.getMemberRole(payload.workspaceId, payload.actorUserId);
    if (!actorRole) {
      throw new Error(
        `User ${payload.actorUserId} is not a member of workspace ${payload.workspaceId}.`
      );
    }

    assertWorkspacePermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      actorRole,
      workspaceOwnerUserId: workspace.createdByUserId,
      action: payload.action,
    });
  }
}

export const workspaceSettingsManager = new WorkspaceSettingsManager();
