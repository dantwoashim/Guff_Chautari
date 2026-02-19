import { describe, expect, it, vi } from 'vitest';
import type { Message } from '../../../types';
import {
  ActivityStore,
  createInMemoryActivityStoreAdapter,
  listActivityEvents,
} from '../../activity';
import {
  createInMemoryDecisionEvidenceStoreAdapter,
  DecisionEvidenceStore,
  listDecisionEvidence,
} from '../../decision';
import {
  createInMemoryKnowledgeStoreAdapter,
  KnowledgeGraphStore,
  searchKnowledgeSources,
} from '../../knowledge';
import type { MeetingSession } from '../types';
import { ingestVoiceNote } from '../voiceNote';
import {
  appendCameraContextDecisionEvidence,
  appendTtsPlaybackToConversationHistory,
  integrateMeetingTranscriptToKnowledge,
} from '../integrations';

describe('voice system integrations', () => {
  it('ingests meeting transcript into knowledge graph and timeline', () => {
    const knowledgeStore = new KnowledgeGraphStore(createInMemoryKnowledgeStoreAdapter());
    const activityStore = new ActivityStore(createInMemoryActivityStoreAdapter());

    const meeting: MeetingSession = {
      id: 'meeting-1',
      userId: 'user-integration',
      title: 'Roadmap Sync',
      status: 'ended',
      createdAtIso: '2026-03-12T09:00:00.000Z',
      updatedAtIso: '2026-03-12T09:45:00.000Z',
      endedAtIso: '2026-03-12T09:45:00.000Z',
      segments: [
        {
          id: 'seg-1',
          sessionId: 'meeting-1',
          speaker: 'host',
          text: 'We agreed to ship ambient mode this week.',
          source: 'manual',
          startedAtIso: '2026-03-12T09:01:00.000Z',
          endedAtIso: '2026-03-12T09:02:00.000Z',
        },
      ],
      notes: [],
    };

    const result = integrateMeetingTranscriptToKnowledge(
      {
        session: meeting,
        threadId: 'thread-meeting',
        nowIso: '2026-03-12T09:50:00.000Z',
      },
      {
        knowledgeStore,
        activityStore,
      }
    );

    expect(result).not.toBeNull();
    const sources = searchKnowledgeSources({ userId: 'user-integration' }, knowledgeStore);
    expect(sources.some((source) => source.title.includes('Meeting Transcript'))).toBe(true);

    const events = listActivityEvents({ userId: 'user-integration', limit: 20 }, activityStore);
    expect(events.some((event) => event.eventType === 'knowledge.meeting_transcript_ingested')).toBe(true);
  });

  it('logs tts playback to conversation history and activity timeline', async () => {
    const activityStore = new ActivityStore(createInMemoryActivityStoreAdapter());
    let persistedMessages: Message[] = [
      {
        id: 'msg-user',
        role: 'user',
        text: 'What is next?',
        timestamp: Date.now() - 5000,
      },
      {
        id: 'msg-model',
        role: 'model',
        text: 'Next step is to review the release checklist.',
        timestamp: Date.now(),
      },
    ];

    const repository = {
      getMessages: vi.fn(async () => persistedMessages),
      saveMessages: vi.fn(async (_sessionId: string, messages: Message[]) => {
        persistedMessages = messages;
      }),
    };

    const result = await appendTtsPlaybackToConversationHistory(
      {
        userId: 'user-integration',
        sessionId: 'session-1',
        messageId: 'msg-model',
        engine: 'web_speech',
        voiceName: 'Kore',
        nowIso: '2026-03-12T10:15:00.000Z',
      },
      {
        repository,
        activityStore,
      }
    );

    expect(result.updated).toBe(true);
    expect(repository.saveMessages).toHaveBeenCalledTimes(1);
    expect(
      (persistedMessages.find((message) => message.id === 'msg-model')?.generationLogs ?? []).some((entry) =>
        entry.includes('tts_played:web_speech:Kore')
      )
    ).toBe(true);

    const events = listActivityEvents({ userId: 'user-integration', limit: 20 }, activityStore);
    expect(events.some((event) => event.eventType === 'chat.tts_playback_logged')).toBe(true);
  });

  it('captures end-to-end voice note -> knowledge -> activity flow', async () => {
    const knowledgeStore = new KnowledgeGraphStore(createInMemoryKnowledgeStoreAdapter());
    const activityStore = new ActivityStore(createInMemoryActivityStoreAdapter());

    await ingestVoiceNote(
      {
        userId: 'user-integration',
        audioBase64: 'BASE64_AUDIO',
        mimeType: 'audio/webm',
        title: 'Voice recap',
        threadId: 'thread-voice',
        nowIso: '2026-03-12T11:00:00.000Z',
      },
      {
        transcriber: async () =>
          'I feel calm today. Reminder to finalize ambient UX and publish release notes.',
        knowledgeStore,
        activityStore,
      }
    );

    const sources = searchKnowledgeSources({ userId: 'user-integration', term: 'ambient' }, knowledgeStore);
    expect(sources.length).toBeGreaterThan(0);

    const events = listActivityEvents({ userId: 'user-integration', limit: 30 }, activityStore);
    expect(events.some((event) => event.eventType === 'knowledge.voice_note_ingested')).toBe(true);
    expect(events.some((event) => event.eventType === 'chat.voice_note_transcribed')).toBe(true);
  });

  it('maps camera context into decision room evidence', () => {
    const evidenceStore = new DecisionEvidenceStore(createInMemoryDecisionEvidenceStoreAdapter());
    const activityStore = new ActivityStore(createInMemoryActivityStoreAdapter());

    const evidence = appendCameraContextDecisionEvidence(
      {
        userId: 'user-integration',
        matrixId: 'decision-room-v1',
        contextText: 'Whiteboard shows blockers around API rate limits.',
        sourceId: 'camera-session-1',
        threadId: 'thread-decision',
        timestampIso: '2026-03-12T12:00:00.000Z',
      },
      {
        evidenceStore,
        activityStore,
      }
    );

    const stored = listDecisionEvidence(
      {
        userId: 'user-integration',
        matrixId: 'decision-room-v1',
      },
      evidenceStore
    );
    expect(stored.some((entry) => entry.id === evidence.id)).toBe(true);

    const events = listActivityEvents({ userId: 'user-integration', limit: 20 }, activityStore);
    expect(events.some((event) => event.eventType === 'decision.camera_context_ingested')).toBe(true);
  });
});
