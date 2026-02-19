import { describe, expect, it, vi } from 'vitest';
import {
  ActivityStore,
  createInMemoryActivityStoreAdapter,
  listActivityEvents,
} from '../../activity';
import {
  createInMemoryKnowledgeStoreAdapter,
  KnowledgeGraphStore,
} from '../../knowledge';
import { ingestVoiceNote } from '../voiceNote';

describe('voice note ingestion', () => {
  it('transcribes voice note audio and ingests transcript into knowledge graph with tags', async () => {
    const knowledgeStore = new KnowledgeGraphStore(createInMemoryKnowledgeStoreAdapter());
    const activityStore = new ActivityStore(createInMemoryActivityStoreAdapter());
    const transcriber = vi.fn(async () =>
      'I feel excited about the launch milestone. Action item is to finalize onboarding checklist by Friday.'
    );

    const result = await ingestVoiceNote(
      {
        userId: 'user-voice-note',
        audioBase64: 'BASE64_AUDIO',
        mimeType: 'audio/webm',
        title: 'Launch voice note',
        threadId: 'thread-1',
        nowIso: '2026-03-08T09:30:00.000Z',
      },
      {
        transcriber,
        knowledgeStore,
        activityStore,
      }
    );

    expect(transcriber).toHaveBeenCalledWith({
      audioBase64: 'BASE64_AUDIO',
      mimeType: 'audio/webm',
    });
    expect(result.transcript.toLowerCase()).toContain('launch milestone');
    expect(result.topics.length).toBeGreaterThan(0);
    expect(result.emotionalTone).toBe('excited');

    const knowledgeState = knowledgeStore.load('user-voice-note');
    expect(knowledgeState.sources.length).toBe(1);
    expect(knowledgeState.nodes.length).toBeGreaterThan(0);
    expect(knowledgeState.sources[0].text.toLowerCase()).toContain('onboarding checklist');
    expect(knowledgeState.sources[0].metadata?.tags).toEqual(
      expect.arrayContaining(['voice-note', 'tone:excited'])
    );

    const events = listActivityEvents({ userId: 'user-voice-note', limit: 20 }, activityStore);
    expect(events.some((event) => event.eventType === 'knowledge.voice_note_ingested')).toBe(true);
    expect(events.some((event) => event.eventType === 'chat.voice_note_transcribed')).toBe(true);
  });
});
