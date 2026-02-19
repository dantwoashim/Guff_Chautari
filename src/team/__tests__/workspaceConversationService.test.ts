import { describe, expect, it } from 'vitest';
import { WorkspaceConversationService } from '../workspaceConversationService';

describe('workspace conversation service', () => {
  it('keeps shared history while returning persona-specific assistant responses', () => {
    const roles = new Map<string, 'owner' | 'member' | 'viewer'>([
      ['owner-1', 'owner'],
      ['member-1', 'member'],
      ['viewer-1', 'viewer'],
    ]);
    const service = new WorkspaceConversationService({
      resolveMemberRole: ({ userId }) => roles.get(userId) ?? null,
      resolveWorkspaceOwnerUserId: () => 'owner-1',
    });

    const conversation = service.createConversation({
      workspaceId: 'workspace-1',
      createdByUserId: 'owner-1',
      title: 'Weekly planning',
      participantUserIds: ['member-1'],
    });

    service.appendUserMessage({
      conversationId: conversation.id,
      authorUserId: 'owner-1',
      text: 'What should we prioritize this week?',
    });
    service.appendAssistantMessage({
      conversationId: conversation.id,
      actorUserId: 'owner-1',
      text: 'Let us prioritize velocity and unblockers.',
      personaOverridesByUserId: {
        'owner-1': 'For you: prioritize strategic deliverables and unblockers.',
        'member-1': 'For you: prioritize concrete tickets and delivery blockers.',
      },
    });

    const ownerView = service.listMessagesForUser({
      conversationId: conversation.id,
      userId: 'owner-1',
    });
    const memberView = service.listMessagesForUser({
      conversationId: conversation.id,
      userId: 'member-1',
    });

    expect(ownerView).toHaveLength(2);
    expect(memberView).toHaveLength(2);
    expect(ownerView[0].text).toBe('What should we prioritize this week?');
    expect(memberView[0].text).toBe('What should we prioritize this week?');
    expect(ownerView[1].text).toContain('strategic deliverables');
    expect(memberView[1].text).toContain('concrete tickets');
    expect(ownerView[1].personalized).toBe(true);
    expect(memberView[1].personalized).toBe(true);

    expect(() =>
      service.listMessagesForUser({
        conversationId: conversation.id,
        userId: 'viewer-1',
      })
    ).toThrow(`User viewer-1 is not part of conversation ${conversation.id}.`);
  });
});

