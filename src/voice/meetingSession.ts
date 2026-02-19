import { transcribeAudio } from '../../services/geminiService';
import { BYOKKeyManager } from '../byok/keyManager';
import { GeminiProvider } from '../providers/gemini/geminiProvider';
import { integrateMeetingTranscriptToKnowledge } from './integrations';
import { extractMeetingActions, type StructuredActionExtractorClient } from './actionExtractor';
import type {
  MeetingActionExtraction,
  MeetingNote,
  MeetingSession,
  MeetingSpeakerRole,
  MeetingTranscriptSource,
  TranscriptSegment,
} from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

type Transcriber = (payload: { audioBase64: string; mimeType: string }) => Promise<string>;

type Summarizer = (payload: {
  session: MeetingSession;
  extraction: MeetingActionExtraction;
}) => Promise<string>;

interface MeetingSessionManagerOptions {
  transcriber?: Transcriber;
  summarizer?: Summarizer;
  structuredExtractorClient?: StructuredActionExtractorClient;
  nowIso?: () => string;
  autoIngestTranscript?: boolean;
}

const defaultTranscriber: Transcriber = async ({ audioBase64, mimeType }) =>
  transcribeAudio(audioBase64, mimeType);

const summarizeWithGemini: Summarizer = async ({ session, extraction }) => {
  try {
    if (typeof window !== 'undefined') {
      // Warm runtime session key when encrypted BYOK storage exists.
      await BYOKKeyManager.getDecryptedKey('gemini');
    }

    const provider = new GeminiProvider();
    const transcript = session.segments.map((segment) => `${segment.speaker}: ${segment.text}`).join('\n');
    if (!transcript) return '';

    const prompt = [
      `Meeting title: ${session.title}`,
      `Decisions captured: ${extraction.decisions.length}`,
      `Action items captured: ${extraction.actionItems.length}`,
      `Questions captured: ${extraction.questions.length}`,
      `Topics: ${extraction.topics.slice(0, 8).map((topic) => topic.label).join(', ')}`,
      'Transcript:',
      transcript,
      'Create a concise meeting summary with concrete decisions, owners, and next steps.',
    ].join('\n\n');

    let summary = '';
    for await (const chunk of provider.streamChat({
      model: 'gemini-2.5-flash',
      temperature: 0.2,
      maxTokens: 420,
      messages: [
        {
          role: 'system',
          content:
            'You summarize meetings. Be concise, factual, and preserve owners, deadlines, and unresolved questions.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    })) {
      summary += chunk.text;
    }

    return cleanText(summary);
  } catch {
    return '';
  }
};

const defaultSummarizer: Summarizer = async ({ session, extraction }) => {
  const llmSummary = await summarizeWithGemini({ session, extraction });
  if (llmSummary) return llmSummary;

  const participants = [...new Set(session.segments.map((segment) => segment.speaker))];
  const decisionPreview =
    extraction.decisions[0]?.text ?? 'No explicit decision captured.';
  const actionPreview =
    extraction.actionItems[0]?.text ?? 'No explicit action item captured.';
  const topicPreview =
    extraction.topics.slice(0, 3).map((topic) => topic.label).join(', ') || 'general';

  return cleanText(
    `Meeting "${session.title}" included ${session.segments.length} transcript segment(s) across ` +
      `${participants.length} speaker role(s). Decisions: ${extraction.decisions.length}. ` +
      `Action items: ${extraction.actionItems.length}. Top topics: ${topicPreview}. ` +
      `Primary decision: ${decisionPreview} Primary action: ${actionPreview}`
  );
};

const cloneSession = (session: MeetingSession): MeetingSession => ({
  ...session,
  segments: [...session.segments],
  notes: [...session.notes],
  extracted: session.extracted
    ? {
        ...session.extracted,
        decisions: [...session.extracted.decisions],
        actionItems: [...session.extracted.actionItems],
        questions: [...session.extracted.questions],
        topics: [...session.extracted.topics],
      }
    : undefined,
});

export class MeetingSessionManager {
  private readonly sessions = new Map<string, MeetingSession>();
  private readonly transcriber: Transcriber;
  private readonly summarizer: Summarizer;
  private readonly nowIso: () => string;
  private readonly structuredExtractorClient?: StructuredActionExtractorClient;
  private readonly autoIngestTranscript: boolean;

  constructor(options: MeetingSessionManagerOptions = {}) {
    this.transcriber = options.transcriber ?? defaultTranscriber;
    this.summarizer = options.summarizer ?? defaultSummarizer;
    this.structuredExtractorClient = options.structuredExtractorClient;
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
    this.autoIngestTranscript = options.autoIngestTranscript ?? true;
  }

  startSession(payload: {
    userId: string;
    title?: string;
    workspaceId?: string;
    nowIso?: string;
  }): MeetingSession {
    const nowIso = payload.nowIso ?? this.nowIso();
    const session: MeetingSession = {
      id: makeId('meeting-session'),
      userId: payload.userId,
      workspaceId: payload.workspaceId,
      title: cleanText(payload.title || 'Untitled Meeting') || 'Untitled Meeting',
      status: 'active',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      segments: [],
      notes: [],
    };
    this.sessions.set(session.id, session);
    return cloneSession(session);
  }

  getSession(sessionId: string): MeetingSession | null {
    const session = this.sessions.get(sessionId);
    return session ? cloneSession(session) : null;
  }

  listSessions(payload: {
    userId: string;
    workspaceId?: string;
  }): MeetingSession[] {
    return [...this.sessions.values()]
      .filter((session) => session.userId === payload.userId)
      .filter((session) =>
        payload.workspaceId ? session.workspaceId === payload.workspaceId : true
      )
      .sort(
        (left, right) => Date.parse(right.updatedAtIso) - Date.parse(left.updatedAtIso)
      )
      .map((session) => cloneSession(session));
  }

  appendTranscriptSegment(payload: {
    sessionId: string;
    speaker: MeetingSpeakerRole;
    text: string;
    source?: MeetingTranscriptSource;
    startedAtIso?: string;
    endedAtIso?: string;
  }): TranscriptSegment {
    const session = this.requireSession(payload.sessionId);
    if (session.status !== 'active') {
      throw new Error(`Meeting session ${payload.sessionId} has ended.`);
    }

    const text = cleanText(payload.text);
    if (!text) {
      throw new Error('Transcript text is required.');
    }

    const startedAtIso = payload.startedAtIso ?? this.nowIso();
    const endedAtIso = payload.endedAtIso ?? startedAtIso;
    const segment: TranscriptSegment = {
      id: makeId('meeting-segment'),
      sessionId: session.id,
      speaker: payload.speaker,
      text,
      source: payload.source ?? 'manual',
      startedAtIso,
      endedAtIso,
    };

    const next: MeetingSession = {
      ...session,
      updatedAtIso: endedAtIso,
      segments: [...session.segments, segment],
    };
    this.sessions.set(session.id, next);
    return { ...segment };
  }

  async appendAudioSegment(payload: {
    sessionId: string;
    speaker: MeetingSpeakerRole;
    audioBase64: string;
    mimeType: string;
    startedAtIso?: string;
    endedAtIso?: string;
  }): Promise<TranscriptSegment> {
    const transcriptText = cleanText(
      await this.transcriber({
        audioBase64: payload.audioBase64,
        mimeType: payload.mimeType,
      })
    );
    if (!transcriptText) {
      throw new Error('Audio transcription returned empty text.');
    }

    return this.appendTranscriptSegment({
      sessionId: payload.sessionId,
      speaker: payload.speaker,
      text: transcriptText,
      source: 'audio',
      startedAtIso: payload.startedAtIso,
      endedAtIso: payload.endedAtIso,
    });
  }

  async extractActions(payload: {
    sessionId: string;
    nowIso?: string;
    preferStructured?: boolean;
  }): Promise<MeetingActionExtraction> {
    const session = this.requireSession(payload.sessionId);
    const transcript = this.composeTranscript(session);
    if (!transcript) {
      throw new Error('Cannot extract actions from an empty transcript.');
    }

    const nowIso = payload.nowIso ?? this.nowIso();
    const extracted = await extractMeetingActions({
      transcript,
      nowIso,
      segmentHints: session.segments.map((segment) => ({
        id: segment.id,
        text: segment.text,
      })),
      client: this.structuredExtractorClient,
      preferStructured: payload.preferStructured,
    });

    const next: MeetingSession = {
      ...session,
      extracted,
      updatedAtIso: nowIso,
    };
    this.sessions.set(session.id, next);
    return {
      ...extracted,
      decisions: [...extracted.decisions],
      actionItems: [...extracted.actionItems],
      questions: [...extracted.questions],
      topics: [...extracted.topics],
    };
  }

  async summarizeSession(payload: {
    sessionId: string;
    nowIso?: string;
  }): Promise<MeetingNote> {
    const session = this.requireSession(payload.sessionId);
    const extraction = session.extracted ?? (await this.extractActions({ sessionId: session.id }));
    const generatedAtIso = payload.nowIso ?? this.nowIso();
    const summary = cleanText(
      await this.summarizer({
        session: cloneSession(session),
        extraction,
      })
    );

    const note: MeetingNote = {
      id: makeId('meeting-note'),
      sessionId: session.id,
      summary: summary || 'No summary generated.',
      generatedAtIso,
      decisionCount: extraction.decisions.length,
      actionItemCount: extraction.actionItems.length,
    };

    const next: MeetingSession = {
      ...session,
      extracted: extraction,
      updatedAtIso: generatedAtIso,
      notes: [note, ...session.notes],
    };
    this.sessions.set(session.id, next);
    return { ...note };
  }

  async endSession(payload: {
    sessionId: string;
    nowIso?: string;
  }): Promise<MeetingSession> {
    const session = this.requireSession(payload.sessionId);
    if (session.status === 'ended') {
      return cloneSession(session);
    }

    const nowIso = payload.nowIso ?? this.nowIso();
    const extraction = session.extracted ?? (await this.extractActions({ sessionId: session.id }));
    const summaryNote = await this.summarizeSession({
      sessionId: session.id,
      nowIso,
    });

    const latest = this.requireSession(session.id);
    const next: MeetingSession = {
      ...latest,
      extracted: extraction,
      status: 'ended',
      endedAtIso: nowIso,
      updatedAtIso: nowIso,
      notes: latest.notes.some((note) => note.id === summaryNote.id)
        ? latest.notes
        : [summaryNote, ...latest.notes],
    };
    this.sessions.set(session.id, next);

    if (this.autoIngestTranscript) {
      try {
        integrateMeetingTranscriptToKnowledge({
          session: next,
          threadId: next.id,
          nowIso,
        });
      } catch {
        // Keep meeting close-out resilient even if knowledge integration fails.
      }
    }

    return cloneSession(next);
  }

  private requireSession(sessionId: string): MeetingSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Meeting session ${sessionId} not found.`);
    }
    return session;
  }

  private composeTranscript(session: MeetingSession): string {
    return session.segments.map((segment) => segment.text).join('\n');
  }
}

export const meetingSessionManager = new MeetingSessionManager();
