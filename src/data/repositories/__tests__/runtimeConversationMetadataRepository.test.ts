import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseLike } from '../base';
import { RuntimeConversationMetadataRepository } from '../runtimeConversationMetadataRepository';

describe('RuntimeConversationMetadataRepository', () => {
  let from: ReturnType<typeof vi.fn>;
  let repository: RuntimeConversationMetadataRepository;

  beforeEach(() => {
    from = vi.fn();
    repository = new RuntimeConversationMetadataRepository({ from, rpc: vi.fn() } as unknown as SupabaseLike);
  });

  it('upserts conversation metadata', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });

    await repository.upsertConversationMetadata({
      userId: 'u-1',
      workspaceId: 'ws-1',
      conversationId: 'c-1',
      personaName: 'Asha',
    });

    expect(from).toHaveBeenCalledWith('runtime_conversation_metadata');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u-1',
        workspace_id: 'ws-1',
        conversation_id: 'c-1',
        persona_name: 'Asha',
      })
    );
  });

  it('loads metadata by conversation id', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'row-1',
        user_id: 'u-1',
        workspace_id: 'ws-1',
        conversation_id: 'c-1',
        persona_name: 'Asha',
        payload: {},
        schema_version: 1,
        version: 1,
        created_at: 'now',
        updated_at: 'now',
      },
      error: null,
    });
    const eqConversation = vi.fn().mockReturnValue({ maybeSingle });
    const eqWorkspace = vi.fn().mockReturnValue({ eq: eqConversation });
    const eqUser = vi.fn().mockReturnValue({ eq: eqWorkspace });
    const select = vi.fn().mockReturnValue({ eq: eqUser });
    from.mockReturnValue({ select });

    const result = await repository.getConversationMetadata({
      userId: 'u-1',
      workspaceId: 'ws-1',
      conversationId: 'c-1',
    });

    expect(result?.conversationId).toBe('c-1');
    expect(result?.personaName).toBe('Asha');
  });
});
