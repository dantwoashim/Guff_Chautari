import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../../../../types';
import type { SupabaseLike } from '../base';
import { MessageRepository } from '../messageRepository';

const createMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'msg-1',
  role: 'user',
  text: 'hello',
  timestamp: Date.now(),
  ...overrides,
});

describe('MessageRepository', () => {
  let from: ReturnType<typeof vi.fn>;
  let rpc: ReturnType<typeof vi.fn>;
  let repository: MessageRepository;

  beforeEach(() => {
    from = vi.fn();
    rpc = vi.fn();
    const client = { from, rpc } as unknown as SupabaseLike;
    repository = new MessageRepository(client);
  });

  it('loads messages for a chat', async () => {
    const message = createMessage();
    const maybeSingle = vi.fn().mockResolvedValue({ data: { messages: [message] }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select });

    const result = await repository.getMessages('chat-1');

    expect(from).toHaveBeenCalledWith('chats');
    expect(select).toHaveBeenCalledWith('messages');
    expect(eq).toHaveBeenCalledWith('id', 'chat-1');
    expect(result).toEqual([message]);
  });

  it('loads messages with created_at metadata', async () => {
    const message = createMessage();
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { messages: [message], created_at: '2026-02-14T00:00:00Z' }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select });

    const result = await repository.getMessagesWithCreatedAt('chat-1');

    expect(select).toHaveBeenCalledWith('messages, created_at');
    expect(result).toEqual({
      messages: [message],
      createdAt: '2026-02-14T00:00:00Z',
    });
  });

  it('throws when getMessages returns an error', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: new Error('db failed') });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select });

    await expect(repository.getMessages('chat-1')).rejects.toThrow('db failed');
  });

  it('saves messages through RPC when available', async () => {
    const message = createMessage({ id: 'msg-rpc-save' });
    rpc.mockResolvedValue({ data: true, error: null });

    await repository.saveMessages('chat-rpc', [message], { touchUpdatedAt: false });

    expect(rpc).toHaveBeenCalledWith('set_chat_messages', {
      p_chat_id: 'chat-rpc',
      p_messages: [message],
      p_touch_updated_at: false,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('upserts message through RPC when available', async () => {
    const message = createMessage({ id: 'msg-upsert-rpc' });
    rpc.mockResolvedValue({ data: true, error: null });

    await repository.upsertMessage('chat-upsert', message, { touchUpdatedAt: false });

    expect(rpc).toHaveBeenCalledWith('upsert_chat_message', {
      p_chat_id: 'chat-upsert',
      p_message: message,
      p_touch_updated_at: false,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('falls back to merge/update behavior when upsert RPC is unavailable', async () => {
    rpc.mockRejectedValue(new Error('rpc unavailable'));

    const existing = createMessage({ id: 'msg-merge', text: 'old text' });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { messages: [existing] }, error: null });
    const eqSelect = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: eqSelect });

    const eqUpdate = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: eqUpdate });

    from
      .mockReturnValueOnce({ select })
      .mockReturnValueOnce({ update });

    await repository.upsertMessage('chat-merge', createMessage({ id: 'msg-merge', text: 'new text' }));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ id: 'msg-merge', text: 'new text' })],
        updated_at: expect.any(String),
      })
    );
    expect(eqUpdate).toHaveBeenCalledWith('id', 'chat-merge');
  });

  it('appends message through RPC when available', async () => {
    rpc.mockResolvedValue({ error: null });
    const message = createMessage({ id: 'msg-rpc' });

    await repository.appendMessage('chat-7', message, []);

    expect(rpc).toHaveBeenCalledWith('append_chat_message', {
      p_chat_id: 'chat-7',
      p_message: message,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('falls back to saveMessages when RPC fails', async () => {
    rpc.mockRejectedValue(new Error('rpc unavailable'));

    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });

    const fallback = [createMessage({ id: 'old-1', text: 'old' })];
    const nextMessage = createMessage({ id: 'new-1', text: 'new' });
    await repository.appendMessage('chat-22', nextMessage, fallback);

    expect(from).toHaveBeenCalledWith('chats');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [...fallback, nextMessage],
        updated_at: expect.any(String),
      })
    );
    expect(eq).toHaveBeenCalledWith('id', 'chat-22');
  });

  it('marks user messages read through RPC when available', async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    const changed = await repository.markUserMessagesRead('chat-read-rpc', { touchUpdatedAt: false });

    expect(changed).toBe(true);
    expect(rpc).toHaveBeenCalledWith('mark_chat_user_messages_read', {
      p_chat_id: 'chat-read-rpc',
      p_touch_updated_at: false,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('falls back to updating unread user messages to read', async () => {
    rpc.mockRejectedValue(new Error('rpc unavailable'));

    const messages = [
      createMessage({ id: 'u-1', role: 'user', status: 'sent' }),
      createMessage({ id: 'm-1', role: 'model', status: 'sent' }),
      createMessage({ id: 'u-2', role: 'user', status: 'read' }),
    ];

    const maybeSingle = vi.fn().mockResolvedValue({ data: { messages }, error: null });
    const eqSelect = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: eqSelect });

    const eqUpdate = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: eqUpdate });

    from
      .mockReturnValueOnce({ select })
      .mockReturnValueOnce({ update });

    const changed = await repository.markUserMessagesRead('chat-read-fallback');

    expect(changed).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({ id: 'u-1', status: 'read' }),
          expect.objectContaining({ id: 'm-1', status: 'sent' }),
          expect.objectContaining({ id: 'u-2', status: 'read' }),
        ],
      })
    );
  });

  it('appends generation logs through RPC when available', async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    const changed = await repository.appendGenerationLog('chat-log-rpc', {
      messageId: 'msg-1',
      logEntry: 'draft-1',
      touchUpdatedAt: false,
    });

    expect(changed).toBe(true);
    expect(rpc).toHaveBeenCalledWith('append_chat_message_generation_log', {
      p_chat_id: 'chat-log-rpc',
      p_message_id: 'msg-1',
      p_log_entry: 'draft-1',
      p_touch_updated_at: false,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('falls back to local generation log append when RPC fails', async () => {
    rpc.mockRejectedValue(new Error('rpc unavailable'));

    const messages = [
      createMessage({ id: 'msg-log', role: 'model', text: 'hello', generationLogs: ['initial'] }),
    ];
    const maybeSingle = vi.fn().mockResolvedValue({ data: { messages }, error: null });
    const eqSelect = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: eqSelect });

    const eqUpdate = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: eqUpdate });

    from
      .mockReturnValueOnce({ select })
      .mockReturnValueOnce({ update });

    const changed = await repository.appendGenerationLog('chat-log-fallback', {
      messageId: 'msg-log',
      logEntry: 'follow-up',
    });

    expect(changed).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            id: 'msg-log',
            generationLogs: ['initial', 'follow-up'],
          }),
        ],
      })
    );
  });

  it('removes message through RPC when available', async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    const changed = await repository.removeMessage('chat-remove-rpc', 'msg-1', {
      touchUpdatedAt: false,
    });

    expect(changed).toBe(true);
    expect(rpc).toHaveBeenCalledWith('remove_chat_message', {
      p_chat_id: 'chat-remove-rpc',
      p_message_id: 'msg-1',
      p_touch_updated_at: false,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('falls back to filtered save when remove RPC fails', async () => {
    rpc.mockRejectedValue(new Error('rpc unavailable'));

    const messages = [
      createMessage({ id: 'keep-1' }),
      createMessage({ id: 'remove-me' }),
    ];
    const maybeSingle = vi.fn().mockResolvedValue({ data: { messages }, error: null });
    const eqSelect = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: eqSelect });

    const eqUpdate = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: eqUpdate });

    from
      .mockReturnValueOnce({ select })
      .mockReturnValueOnce({ update });

    const changed = await repository.removeMessage('chat-remove-fallback', 'remove-me');

    expect(changed).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ id: 'keep-1' })],
        updated_at: expect.any(String),
      })
    );
  });

  it('returns false when removeMessage receives an empty message id', async () => {
    const changed = await repository.removeMessage('chat-empty', '   ');

    expect(changed).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('can save messages without touching updated_at', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });

    await repository.saveMessages('chat-no-touch', [createMessage()], { touchUpdatedAt: false });

    expect(update).toHaveBeenCalledWith({
      messages: [expect.objectContaining({ id: 'msg-1' })],
    });
  });

  it('updates conversation preview from latest message', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });

    await repository.updateConversationPreview(
      'conv-1',
      createMessage({ text: 'x'.repeat(120), role: 'model' })
    );

    expect(from).toHaveBeenCalledWith('conversations');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_message_text: 'x'.repeat(100),
        last_message_at: expect.any(String),
      })
    );
    expect(eq).toHaveBeenCalledWith('id', 'conv-1');
  });

  it('deletes a chat', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ delete: del });

    await repository.deleteChat('chat-delete');

    expect(from).toHaveBeenCalledWith('chats');
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'chat-delete');
  });
});
