import { Conversation } from '../../../types';
import { defaultSupabaseClient, SupabaseLike } from './base';

interface CreateConversationInput {
  userId: string;
  personaId: string;
  workspaceId?: string;
  visibility?: 'personal' | 'workspace';
  participantUserIds?: string[];
}

interface CreateChatInput {
  id: string;
  userId: string;
  personaId: string;
  title: string;
  metadata?: Record<string, unknown>;
}

interface ConversationUpdateFlags {
  is_archived?: boolean;
  is_muted?: boolean;
  is_pinned?: boolean;
  unread_count?: number;
}

export class ConversationRepository {
  constructor(private readonly client: SupabaseLike = defaultSupabaseClient) {}

  async listByUser(userId: string): Promise<Conversation[]> {
    const { data, error } = await this.client
      .from('conversations')
      .select(
        `
          *,
          persona:personas(*)
        `
      )
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Conversation[];
  }

  async listByUserAndPersona(userId: string, personaId: string): Promise<Conversation[]> {
    const { data, error } = await this.client
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .eq('persona_id', personaId)
      .order('last_message_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Conversation[];
  }

  async listByWorkspace(workspaceId: string): Promise<Conversation[]> {
    const { data, error } = await this.client
      .from('conversations')
      .select(
        `
          *,
          persona:personas(*)
        `
      )
      .eq('workspace_id', workspaceId)
      .order('last_message_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Conversation[];
  }

  async listByWorkspaceAndPersona(workspaceId: string, personaId: string): Promise<Conversation[]> {
    const { data, error } = await this.client
      .from('conversations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('persona_id', personaId)
      .order('last_message_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Conversation[];
  }

  async createConversation(input: CreateConversationInput): Promise<{ id: string }> {
    const nowIso = new Date().toISOString();
    const insertPayload: Record<string, unknown> = {
      user_id: input.userId,
      persona_id: input.personaId,
      created_at: nowIso,
      last_message_at: nowIso,
      last_message_text: null,
      unread_count: 0,
      is_pinned: false,
      is_muted: false,
      is_archived: false,
    };
    if (input.workspaceId) {
      insertPayload.workspace_id = input.workspaceId;
      insertPayload.visibility = input.visibility ?? 'workspace';
      if (input.participantUserIds && input.participantUserIds.length > 0) {
        insertPayload.participant_user_ids = [...new Set(input.participantUserIds)];
      }
    }

    const { data, error } = await this.client
      .from('conversations')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) throw error;
    const conversation = (data || null) as { id: string } | null;
    if (!conversation?.id) {
      throw new Error('Conversation creation returned no id');
    }
    return conversation;
  }

  async createChat(input: CreateChatInput): Promise<void> {
    const { error } = await this.client.from('chats').insert({
      id: input.id,
      session_id: input.id,
      user_id: input.userId,
      persona_id: input.personaId,
      title: input.title,
      messages: [],
      metadata: input.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async deleteConversation(id: string): Promise<void> {
    const { error } = await this.client.from('conversations').delete().eq('id', id);
    if (error) throw error;
  }

  async updateFlags(id: string, flags: ConversationUpdateFlags): Promise<void> {
    const { error } = await this.client
      .from('conversations')
      .update(flags as Record<string, unknown>)
      .eq('id', id);
    if (error) throw error;
  }
}

export const conversationRepository = new ConversationRepository();
