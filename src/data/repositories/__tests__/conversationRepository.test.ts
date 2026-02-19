import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '../../../../types';
import type { SupabaseLike } from '../base';
import { ConversationRepository } from '../conversationRepository';

const createConversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: overrides.id ?? 'conv-1',
  persona_id: overrides.persona_id ?? 'persona-1',
  persona: overrides.persona ?? {
    id: 'persona-1',
    user_id: 'user-1',
    name: 'Asha',
    description: 'desc',
    system_instruction: 'sys',
  },
  unread_count: overrides.unread_count ?? 0,
  is_pinned: overrides.is_pinned ?? false,
  is_muted: overrides.is_muted ?? false,
  is_archived: overrides.is_archived ?? false,
  workspace_id: overrides.workspace_id,
  visibility: overrides.visibility,
  participant_user_ids: overrides.participant_user_ids,
  last_message_at: overrides.last_message_at,
  last_message_text: overrides.last_message_text,
});

describe('ConversationRepository', () => {
  let from: ReturnType<typeof vi.fn>;
  let repository: ConversationRepository;

  beforeEach(() => {
    from = vi.fn();
    const client = { from, rpc: vi.fn() } as unknown as SupabaseLike;
    repository = new ConversationRepository(client);
  });

  it('lists conversations for a user ordered by last message date', async () => {
    const rows = [createConversation({ id: 'conv-9' })];
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select });

    const result = await repository.listByUser('user-99');

    expect(from).toHaveBeenCalledWith('conversations');
    expect(select).toHaveBeenCalledWith(
      expect.stringContaining('persona:personas')
    );
    expect(eq).toHaveBeenCalledWith('user_id', 'user-99');
    expect(order).toHaveBeenCalledWith('last_message_at', { ascending: false });
    expect(result).toEqual(rows);
  });

  it('creates a conversation row and returns its id', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'new-conv' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    from.mockReturnValue({ insert });

    const result = await repository.createConversation({
      userId: 'user-1',
      personaId: 'persona-2',
    });

    expect(from).toHaveBeenCalledWith('conversations');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        persona_id: 'persona-2',
        created_at: expect.any(String),
        last_message_at: expect.any(String),
        unread_count: 0,
        is_pinned: false,
        is_muted: false,
        is_archived: false,
      })
    );
    expect(select).toHaveBeenCalledWith('id');
    expect(result).toEqual({ id: 'new-conv' });
  });

  it('lists conversations for a workspace ordered by last message date', async () => {
    const rows = [createConversation({ id: 'conv-workspace-1', workspace_id: 'workspace-1' })];
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select });

    const result = await repository.listByWorkspace('workspace-1');

    expect(from).toHaveBeenCalledWith('conversations');
    expect(eq).toHaveBeenCalledWith('workspace_id', 'workspace-1');
    expect(order).toHaveBeenCalledWith('last_message_at', { ascending: false });
    expect(result).toEqual(rows);
  });

  it('creates workspace-scoped conversations with participants', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'new-workspace-conv' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    from.mockReturnValue({ insert });

    const result = await repository.createConversation({
      userId: 'owner-1',
      personaId: 'persona-2',
      workspaceId: 'workspace-1',
      participantUserIds: ['owner-1', 'member-1'],
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'owner-1',
        persona_id: 'persona-2',
        workspace_id: 'workspace-1',
        visibility: 'workspace',
        participant_user_ids: ['owner-1', 'member-1'],
      })
    );
    expect(result).toEqual({ id: 'new-workspace-conv' });
  });

  it('creates the chat row tied to a conversation', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ insert });

    await repository.createChat({
      id: 'conv-44',
      userId: 'user-44',
      personaId: 'persona-44',
      title: 'Chat with Persona',
    });

    expect(from).toHaveBeenCalledWith('chats');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'conv-44',
        session_id: 'conv-44',
        user_id: 'user-44',
        persona_id: 'persona-44',
        title: 'Chat with Persona',
        messages: [],
        metadata: {},
        created_at: expect.any(String),
        updated_at: expect.any(String),
      })
    );
  });

  it('deletes conversation by id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ delete: del });

    await repository.deleteConversation('conv-gone');

    expect(from).toHaveBeenCalledWith('conversations');
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'conv-gone');
  });
});
