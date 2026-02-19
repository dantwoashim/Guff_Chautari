import { describe, expect, it } from 'vitest';
import { MeetingSessionManager } from '../meetingSession';

describe('meeting session manager', () => {
  it('tracks transcript segments from audio transcription and manual input', async () => {
    const manager = new MeetingSessionManager({
      transcriber: async ({ audioBase64, mimeType }) => {
        expect(audioBase64).toBe('BASE64_AUDIO');
        expect(mimeType).toBe('audio/wav');
        return 'Kickoff meeting started and we agreed to ship the release.';
      },
      nowIso: () => '2026-03-07T10:00:00.000Z',
      autoIngestTranscript: false,
    });

    const session = manager.startSession({
      userId: 'owner-1',
      workspaceId: 'workspace-1',
      title: 'Weekly Product Sync',
    });

    const audioSegment = await manager.appendAudioSegment({
      sessionId: session.id,
      speaker: 'host',
      audioBase64: 'BASE64_AUDIO',
      mimeType: 'audio/wav',
      startedAtIso: '2026-03-07T10:00:05.000Z',
      endedAtIso: '2026-03-07T10:00:25.000Z',
    });
    expect(audioSegment.source).toBe('audio');
    expect(audioSegment.text).toContain('agreed to ship');

    const manualSegment = manager.appendTranscriptSegment({
      sessionId: session.id,
      speaker: 'participant',
      text: 'Action item: @alex will schedule next meeting by 2026-03-10.',
      source: 'manual',
      startedAtIso: '2026-03-07T10:01:00.000Z',
      endedAtIso: '2026-03-07T10:01:20.000Z',
    });
    expect(manualSegment.source).toBe('manual');

    const ended = await manager.endSession({
      sessionId: session.id,
      nowIso: '2026-03-07T10:10:00.000Z',
    });

    expect(ended.status).toBe('ended');
    expect(ended.segments).toHaveLength(2);
    expect(ended.extracted?.decisions.length ?? 0).toBeGreaterThan(0);
    expect(ended.extracted?.actionItems.length ?? 0).toBeGreaterThan(0);
    expect(ended.notes.length).toBeGreaterThan(0);
  });
});
