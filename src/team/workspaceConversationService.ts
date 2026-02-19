import {
  assertWorkspacePermission,
  type WorkspacePermission,
  type WorkspacePermissionContext,
} from './permissions';
import { runtimeConversationMetadataRepository } from '../data/repositories';
import { isSupabasePersistenceEnabled } from '../runtime/persistenceMode';
import type {
  WorkspaceConversation,
  WorkspaceConversationMessage,
  WorkspaceConversationMessageView,
  WorkspaceRole,
} from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

interface ConversationServiceOptions {
  nowIso?: () => string;
  resolveMemberRole: (payload: { workspaceId: string; userId: string }) => WorkspaceRole | null;
  resolveWorkspaceOwnerUserId?: (workspaceId: string) => string | null;
}

const isParticipant = (conversation: WorkspaceConversation, userId: string): boolean =>
  conversation.participantUserIds.includes(userId);

export class WorkspaceConversationService {
  private readonly nowIso: () => string;
  private readonly resolveMemberRole: ConversationServiceOptions['resolveMemberRole'];
  private readonly resolveWorkspaceOwnerUserId?: ConversationServiceOptions['resolveWorkspaceOwnerUserId'];
  private readonly conversations = new Map<string, WorkspaceConversation>();
  private readonly conversationIdsByWorkspace = new Map<string, string[]>();
  private readonly messagesByConversation = new Map<string, WorkspaceConversationMessage[]>();

  constructor(options: ConversationServiceOptions) {
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
    this.resolveMemberRole = options.resolveMemberRole;
    this.resolveWorkspaceOwnerUserId = options.resolveWorkspaceOwnerUserId;
  }

  createConversation(payload: {
    workspaceId: string;
    createdByUserId: string;
    title: string;
    participantUserIds?: string[];
    nowIso?: string;
  }): WorkspaceConversation {
    this.requirePermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.createdByUserId,
      action: 'workspace.conversations.write',
    });

    const nowIso = payload.nowIso ?? this.nowIso();
    const participantUserIds = [...new Set([payload.createdByUserId, ...(payload.participantUserIds ?? [])])];
    const conversation: WorkspaceConversation = {
      id: makeId('workspace-conversation'),
      workspaceId: payload.workspaceId,
      title: payload.title.trim() || 'Untitled conversation',
      createdByUserId: payload.createdByUserId,
      participantUserIds,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    this.conversations.set(conversation.id, conversation);
    const workspaceIds = this.conversationIdsByWorkspace.get(payload.workspaceId) ?? [];
    this.conversationIdsByWorkspace.set(payload.workspaceId, [conversation.id, ...workspaceIds]);
    this.messagesByConversation.set(conversation.id, []);
    this.persistConversationSnapshot(conversation.id);
    return conversation;
  }

  listConversations(payload: { workspaceId: string; userId: string }): WorkspaceConversation[] {
    this.requirePermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.userId,
      action: 'workspace.conversations.read',
    });

    const ids = this.conversationIdsByWorkspace.get(payload.workspaceId) ?? [];
    return ids
      .map((id) => this.conversations.get(id))
      .filter((conversation): conversation is WorkspaceConversation => Boolean(conversation))
      .filter((conversation) => isParticipant(conversation, payload.userId))
      .sort((left, right) => Date.parse(right.updatedAtIso) - Date.parse(left.updatedAtIso));
  }

  appendUserMessage(payload: {
    conversationId: string;
    authorUserId: string;
    text: string;
    nowIso?: string;
  }): WorkspaceConversationMessage {
    const conversation = this.getConversation(payload.conversationId);
    this.requireParticipantWriteAccess(conversation, payload.authorUserId);
    const nowIso = payload.nowIso ?? this.nowIso();

    const message: WorkspaceConversationMessage = {
      id: makeId('workspace-message'),
      conversationId: conversation.id,
      workspaceId: conversation.workspaceId,
      role: 'user',
      text: payload.text,
      authorUserId: payload.authorUserId,
      createdAtIso: nowIso,
    };
    this.persistMessage(message);
    this.touchConversation(conversation.id, nowIso);
    this.persistConversationSnapshot(conversation.id);
    return message;
  }

  appendAssistantMessage(payload: {
    conversationId: string;
    actorUserId: string;
    text: string;
    personaOverridesByUserId?: Record<string, string>;
    nowIso?: string;
  }): WorkspaceConversationMessage {
    const conversation = this.getConversation(payload.conversationId);
    this.requireParticipantWriteAccess(conversation, payload.actorUserId);
    const nowIso = payload.nowIso ?? this.nowIso();

    const overrides = payload.personaOverridesByUserId
      ? Object.fromEntries(
          Object.entries(payload.personaOverridesByUserId).filter(([userId]) =>
            conversation.participantUserIds.includes(userId)
          )
        )
      : undefined;

    const message: WorkspaceConversationMessage = {
      id: makeId('workspace-message'),
      conversationId: conversation.id,
      workspaceId: conversation.workspaceId,
      role: 'assistant',
      text: payload.text,
      createdAtIso: nowIso,
      personaOverridesByUserId: overrides,
    };
    this.persistMessage(message);
    this.touchConversation(conversation.id, nowIso);
    this.persistConversationSnapshot(conversation.id);
    return message;
  }

  listMessagesForUser(payload: {
    conversationId: string;
    userId: string;
  }): WorkspaceConversationMessageView[] {
    const conversation = this.getConversation(payload.conversationId);
    this.requirePermission({
      workspaceId: conversation.workspaceId,
      actorUserId: payload.userId,
      action: 'workspace.conversations.read',
    });
    if (!isParticipant(conversation, payload.userId)) {
      throw new Error(`User ${payload.userId} is not part of conversation ${payload.conversationId}.`);
    }

    const messages = this.messagesByConversation.get(payload.conversationId) ?? [];
    return messages.map((message) => {
      if (message.role !== 'assistant') {
        return {
          ...message,
          personalized: false,
        };
      }
      const personalizedText = message.personaOverridesByUserId?.[payload.userId];
      return {
        ...message,
        text: personalizedText ?? message.text,
        personalized: Boolean(personalizedText),
      };
    });
  }

  private persistMessage(message: WorkspaceConversationMessage): void {
    const messages = this.messagesByConversation.get(message.conversationId) ?? [];
    this.messagesByConversation.set(message.conversationId, [...messages, message]);
  }

  private getConversation(conversationId: string): WorkspaceConversation {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found.`);
    }
    return conversation;
  }

  private touchConversation(conversationId: string, nowIso: string): void {
    const conversation = this.getConversation(conversationId);
    this.conversations.set(conversationId, {
      ...conversation,
      updatedAtIso: nowIso,
    });
  }

  private persistConversationSnapshot(conversationId: string): void {
    if (!isSupabasePersistenceEnabled()) return;
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;
    const messages = this.messagesByConversation.get(conversationId) ?? [];

    void runtimeConversationMetadataRepository.upsertConversationMetadata({
      userId: conversation.createdByUserId,
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      metadata: {
        conversation,
        messages,
      },
      schemaVersion: 1,
      version: 1,
    });
  }

  private requireParticipantWriteAccess(conversation: WorkspaceConversation, actorUserId: string): void {
    this.requirePermission({
      workspaceId: conversation.workspaceId,
      actorUserId,
      action: 'workspace.conversations.write',
    });
    if (!isParticipant(conversation, actorUserId)) {
      throw new Error(`User ${actorUserId} is not part of conversation ${conversation.id}.`);
    }
  }

  private requirePermission(payload: {
    workspaceId: string;
    actorUserId: string;
    action: WorkspacePermission;
  }): void {
    const actorRole = this.resolveMemberRole({
      workspaceId: payload.workspaceId,
      userId: payload.actorUserId,
    });
    if (!actorRole) {
      throw new Error(`User ${payload.actorUserId} is not a member of workspace ${payload.workspaceId}.`);
    }

    const context: WorkspacePermissionContext = {
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      actorRole,
      action: payload.action,
      workspaceOwnerUserId: this.resolveWorkspaceOwnerUserId?.(payload.workspaceId) ?? undefined,
    };
    assertWorkspacePermission(context);
  }
}
