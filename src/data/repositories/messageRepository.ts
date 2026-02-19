import { Message } from '../../../types';
import { defaultSupabaseClient, SupabaseLike } from './base';

interface SaveMessagesOptions {
  touchUpdatedAt?: boolean;
}

interface UpsertMessageOptions {
  touchUpdatedAt?: boolean;
  fallbackMessages?: Message[];
}

interface ChatMessageRow {
  messages?: Message[];
  created_at?: string | null;
}

export interface ChatHistoryEntry {
  id: string;
  created_at: string;
  updated_at: string;
  messages: Message[];
  title?: string | null;
}

interface CreateChatInput {
  userId: string;
  sessionId?: string | null;
  personaId?: string | null;
  title: string;
  messages?: Message[];
}

export class MessageRepository {
  constructor(private readonly client: SupabaseLike = defaultSupabaseClient) {}

  async getMessages(chatId: string): Promise<Message[]> {
    const row = await this.getChatMessageRow(chatId, 'messages');
    return row?.messages || [];
  }

  async getMessagesWithCreatedAt(chatId: string): Promise<{ messages: Message[]; createdAt: string | null } | null> {
    const row = await this.getChatMessageRow(chatId, 'messages, created_at');
    if (!row) return null;

    return {
      messages: row.messages || [],
      createdAt: row.created_at ?? null,
    };
  }

  async saveMessages(chatId: string, messages: Message[], options: SaveMessagesOptions = {}): Promise<void> {
    const touchUpdatedAt = options.touchUpdatedAt !== false;

    try {
      const rpcResult = await this.client.rpc('set_chat_messages', {
        p_chat_id: chatId,
        p_messages: messages,
        p_touch_updated_at: touchUpdatedAt,
      });
      if (!rpcResult || typeof rpcResult !== 'object') {
        throw new Error('set_chat_messages RPC unavailable.');
      }
      if (rpcResult.error) throw rpcResult.error;
      return;
    } catch {
      // Fall back to direct update for environments without RPC migration.
    }

    const updatePayload: Record<string, unknown> = { messages };
    if (touchUpdatedAt) {
      updatePayload.updated_at = new Date().toISOString();
    }

    const { error } = await this.client
      .from('chats')
      .update(updatePayload)
      .eq('id', chatId);

    if (error) throw error;
  }

  async upsertMessage(chatId: string, message: Message, options: UpsertMessageOptions = {}): Promise<void> {
    const touchUpdatedAt = options.touchUpdatedAt !== false;
    try {
      const rpcResult = await this.client.rpc('upsert_chat_message', {
        p_chat_id: chatId,
        p_message: message,
        p_touch_updated_at: touchUpdatedAt,
      });
      if (!rpcResult || typeof rpcResult !== 'object') {
        throw new Error('upsert_chat_message RPC unavailable.');
      }
      if (rpcResult.error) throw rpcResult.error;
      return;
    } catch {
      const currentMessages = options.fallbackMessages ?? (await this.getMessages(chatId));
      const exists = currentMessages.some((entry) => entry.id === message.id);
      const nextMessages = exists
        ? currentMessages.map((entry) => (entry.id === message.id ? { ...entry, ...message } : entry))
        : [...currentMessages, message];
      await this.saveMessages(chatId, nextMessages, { touchUpdatedAt });
    }
  }

  async appendMessage(chatId: string, message: Message, fallbackMessages: Message[]): Promise<void> {
    try {
      const { error } = await this.client.rpc('append_chat_message', {
        p_chat_id: chatId,
        p_message: message,
      });
      if (error) throw error;
    } catch {
      const exists = fallbackMessages.some((entry) => entry.id === message.id);
      const nextMessages = exists
        ? fallbackMessages.map((entry) => (entry.id === message.id ? { ...entry, ...message } : entry))
        : [...fallbackMessages, message];
      await this.saveMessages(chatId, nextMessages);
    }
  }

  async markUserMessagesRead(chatId: string, options: { touchUpdatedAt?: boolean } = {}): Promise<boolean> {
    const touchUpdatedAt = options.touchUpdatedAt !== false;
    try {
      const rpcResult = await this.client.rpc('mark_chat_user_messages_read', {
        p_chat_id: chatId,
        p_touch_updated_at: touchUpdatedAt,
      });
      if (!rpcResult || typeof rpcResult !== 'object') {
        throw new Error('mark_chat_user_messages_read RPC unavailable.');
      }
      if (rpcResult.error) throw rpcResult.error;
      return true;
    } catch {
      const messages = await this.getMessages(chatId);
      if (!messages.length) return false;
      const updatedMessages = messages.map((message) =>
        message.role === 'user' && message.status !== 'read'
          ? { ...message, status: 'read' as const }
          : message
      );
      const changed = updatedMessages.some((message, index) => message !== messages[index]);
      if (!changed) return false;
      await this.saveMessages(chatId, updatedMessages, { touchUpdatedAt });
      return true;
    }
  }

  async appendGenerationLog(
    chatId: string,
    payload: { messageId: string; logEntry: string; touchUpdatedAt?: boolean }
  ): Promise<boolean> {
    const touchUpdatedAt = payload.touchUpdatedAt !== false;
    try {
      const rpcResult = await this.client.rpc('append_chat_message_generation_log', {
        p_chat_id: chatId,
        p_message_id: payload.messageId,
        p_log_entry: payload.logEntry,
        p_touch_updated_at: touchUpdatedAt,
      });
      if (!rpcResult || typeof rpcResult !== 'object') {
        throw new Error('append_chat_message_generation_log RPC unavailable.');
      }
      if (rpcResult.error) throw rpcResult.error;
      return true;
    } catch {
      const messages = await this.getMessages(chatId);
      const targetIndex = messages.findIndex((message) => message.id === payload.messageId);
      if (targetIndex < 0) return false;

      const updatedMessages = messages.map((message, index) => {
        if (index !== targetIndex) return message;
        const currentLogs = Array.isArray(message.generationLogs) ? [...message.generationLogs] : [];
        if (!currentLogs.includes(payload.logEntry)) {
          currentLogs.push(payload.logEntry);
        }
        return {
          ...message,
          generationLogs: currentLogs,
        };
      });
      await this.saveMessages(chatId, updatedMessages, { touchUpdatedAt });
      return true;
    }
  }

  async removeMessage(
    chatId: string,
    messageId: string,
    options: { touchUpdatedAt?: boolean } = {}
  ): Promise<boolean> {
    const normalizedMessageId = messageId.trim();
    if (!normalizedMessageId) {
      return false;
    }

    const touchUpdatedAt = options.touchUpdatedAt !== false;
    try {
      const rpcResult = await this.client.rpc('remove_chat_message', {
        p_chat_id: chatId,
        p_message_id: normalizedMessageId,
        p_touch_updated_at: touchUpdatedAt,
      });
      if (!rpcResult || typeof rpcResult !== 'object') {
        throw new Error('remove_chat_message RPC unavailable.');
      }
      if (rpcResult.error) throw rpcResult.error;
      return rpcResult.data !== false;
    } catch {
      const messages = await this.getMessages(chatId);
      const filtered = messages.filter((message) => message.id !== normalizedMessageId);
      if (filtered.length === messages.length) {
        return false;
      }
      await this.saveMessages(chatId, filtered, { touchUpdatedAt });
      return true;
    }
  }

  async updateConversationPreview(conversationId: string, message: Message): Promise<void> {
    const { error } = await this.client
      .from('conversations')
      .update({
        last_message_text: message.text?.slice(0, 100) || '[media]',
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    if (error) throw error;
  }

  async deleteChat(chatId: string): Promise<void> {
    const { error } = await this.client.from('chats').delete().eq('id', chatId);
    if (error) throw error;
  }

  async createChat(input: CreateChatInput): Promise<void> {
    const { error } = await this.client.from('chats').insert({
      user_id: input.userId,
      session_id: input.sessionId ?? null,
      persona_id: input.personaId ?? null,
      title: input.title,
      messages: input.messages ?? [],
    });
    if (error) throw error;
  }

  async listChatsByPersona(personaId: string, limit = 50): Promise<ChatHistoryEntry[]> {
    const { data, error } = await this.client
      .from('chats')
      .select('id, created_at, updated_at, messages, title')
      .eq('persona_id', personaId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as ChatHistoryEntry[];
  }

  private async getChatMessageRow(chatId: string, columns: string): Promise<ChatMessageRow | null> {
    const { data, error } = await this.client
      .from('chats')
      .select(columns)
      .eq('id', chatId)
      .maybeSingle();
    if (error) throw error;
    return (data || null) as ChatMessageRow | null;
  }
}

export const messageRepository = new MessageRepository();
