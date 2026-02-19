import { describe, expect, it } from 'vitest';
import {
  addKnowledgeVoiceNote,
  beginReplyGesture,
  createChatScreenState,
  createKnowledgeScreenState,
  handleLongPressQuickAction,
  listVisibleKnowledgeEntries,
  scoreDecisionOptions,
  sendChatMessage,
  summarizeMobileWorkflow,
} from '../screens';
import { handleNotificationAction } from '../notifications';

describe('week 91 mobile screens + notifications', () => {
  it('runs chat screen pipeline and appends streamed assistant chunks', async () => {
    const state = createChatScreenState({
      conversationId: 'conv-mobile-1',
      personaTheme: {
        personaId: 'mentor',
        bubbleAccent: '#38bdf8',
        avatarVariant: 'mentor',
      },
    });

    const next = await sendChatMessage(state, {
      text: 'Summarize my day in one plan',
      nowIso: '2026-12-02T08:00:00.000Z',
      pipeline: {
        run: async () => ({
          text: 'Plan A',
          chunks: ['Plan A: focus block', 'Plan B: review checkpoint'],
        }),
      },
    });

    expect(next.streaming).toBe(false);
    expect(next.messages).toHaveLength(3);
    expect(next.messages[1]?.role).toBe('assistant');
    expect(next.messages[2]?.text).toContain('Plan B');
  });

  it('supports gesture reply action and knowledge voice-note search', () => {
    const state = createChatScreenState({
      conversationId: 'conv-mobile-2',
      personaTheme: {
        personaId: 'calm',
        bubbleAccent: '#0ea5e9',
        avatarVariant: 'calm',
      },
    });

    const replied = beginReplyGesture(state, 'msg-1');
    const longPress = handleLongPressQuickAction(replied, {
      action: 'reply',
      messageId: 'msg-2',
    });

    expect(longPress.pendingReplyToMessageId).toBe('msg-2');

    let knowledge = createKnowledgeScreenState();
    knowledge = addKnowledgeVoiceNote(knowledge, {
      id: 'note-1',
      title: 'Standup note',
      transcript: 'Need to ship checkpoint approvals today',
      createdAtIso: '2026-12-02T09:00:00.000Z',
    });
    knowledge.query = 'checkpoint';

    const visible = listVisibleKnowledgeEntries(knowledge);
    expect(visible).toHaveLength(1);
  });

  it('scores decision options and summarizes workflow + notification actions', () => {
    const scores = scoreDecisionOptions({
      id: 'd1',
      question: 'Which sprint plan should we pick?',
      options: [
        { id: 'o1', label: 'Focus', impact: 0.9, speed: 0.7, risk: 0.4 },
        { id: 'o2', label: 'Broad', impact: 0.7, speed: 0.5, risk: 0.6 },
      ],
    });

    expect(scores[0]?.optionId).toBe('o1');

    const summary = summarizeMobileWorkflow({
      id: 'wf-1',
      name: 'Daily Pipeline',
      status: 'running',
      checkpoints: [
        { id: 'cp-1', title: 'Approve draft', status: 'pending' },
        { id: 'cp-2', title: 'Review send', status: 'approved' },
      ],
    });

    expect(summary.pendingCheckpointCount).toBe(1);

    const action = handleNotificationAction(
      {
        id: 'n1',
        type: 'workflow.checkpoint_pending',
        title: 'Checkpoint pending',
        body: 'Approve now',
        createdAtIso: '2026-12-02T09:30:00.000Z',
      },
      'approve'
    );

    expect(action.route).toBe('/workflow');
    expect(action.action).toBe('approve');
  });
});
