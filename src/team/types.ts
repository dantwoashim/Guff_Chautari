import type { BYOKProvider } from '../byok';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';
export type WorkspaceStatus = 'active' | 'archived';
export type WorkspaceInviteStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type WorkspaceMemoryVisibility = 'personal' | 'shared';
export type WorkspaceConversationMessageRole = 'user' | 'assistant' | 'system';

export interface WorkspaceNamespace {
  conversations: string;
  knowledge: string;
  workflows: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceStatus;
  createdByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
  namespace: WorkspaceNamespace;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAtIso: string;
  invitedByUserId?: string;
  removedAtIso?: string;
}

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  invitedByUserId: string;
  status: WorkspaceInviteStatus;
  createdAtIso: string;
  respondedAtIso?: string;
  responderUserId?: string;
}

export interface WorkspaceMemoryRecord {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  visibility: WorkspaceMemoryVisibility;
  namespace: string;
  title: string;
  content: string;
  tags: string[];
  createdAtIso: string;
  updatedAtIso: string;
  sourceMemoryId?: string;
  promotedAtIso?: string;
  promotedByUserId?: string;
}

export interface WorkspaceConversation {
  id: string;
  workspaceId: string;
  title: string;
  createdByUserId: string;
  participantUserIds: string[];
  createdAtIso: string;
  updatedAtIso: string;
}

export interface WorkspaceConversationMessage {
  id: string;
  conversationId: string;
  workspaceId: string;
  role: WorkspaceConversationMessageRole;
  text: string;
  createdAtIso: string;
  authorUserId?: string;
  personaOverridesByUserId?: Record<string, string>;
}

export interface WorkspaceConversationMessageView {
  id: string;
  conversationId: string;
  workspaceId: string;
  role: WorkspaceConversationMessageRole;
  text: string;
  createdAtIso: string;
  authorUserId?: string;
  personalized: boolean;
}

export interface TeamKeyResolution {
  workspaceId: string;
  provider: BYOKProvider;
  key: string;
  resolvedForUserId: string;
  source: 'workspace_member' | 'workspace_default' | 'byok_fallback';
}

export interface WorkspaceStoreState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  membersByWorkspaceId: Record<string, WorkspaceMember[]>;
  pendingInvitesByWorkspaceId: Record<string, WorkspaceInvite[]>;
}

export interface WorkspaceNotificationPreferences {
  workflowFailures: boolean;
  workflowCompletions: boolean;
  dailyBriefing: boolean;
  mentions: boolean;
}

export interface WorkspaceApiKeyConfig {
  provider: BYOKProvider;
  routingMode: 'member_keys_only' | 'workspace_default_key';
  allowPersonalFallback: boolean;
  hasWorkspaceDefaultKey: boolean;
  updatedAtIso: string;
  updatedByUserId: string;
}

export interface WorkspaceSettingsRecord {
  workspaceId: string;
  notificationPreferences: WorkspaceNotificationPreferences;
  apiKeyConfigByProvider: Record<BYOKProvider, WorkspaceApiKeyConfig>;
  createdAtIso: string;
  updatedAtIso: string;
  updatedByUserId: string;
}
