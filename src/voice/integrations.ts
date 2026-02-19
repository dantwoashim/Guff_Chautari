import type { Message } from '../../types';
import {
  emitActivityEvent,
  type ActivityStore,
  activityStore as defaultActivityStore,
} from '../activity';
import {
  appendDecisionEvidence,
  type DecisionEvidence,
  type DecisionEvidenceStore,
  decisionEvidenceStore as defaultDecisionEvidenceStore,
} from '../decision';
import type { MessageRepository } from '../data/repositories';
import { messageRepository as defaultMessageRepository } from '../data/repositories';
import {
  ingestKnowledgeNote,
  type IngestKnowledgeResult,
  type KnowledgeGraphStore,
  knowledgeGraphStore as defaultKnowledgeStore,
} from '../knowledge';
import type { MeetingSession } from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const mergeGenerationLog = (existing: ReadonlyArray<string> | undefined, nextEntry: string): string[] => {
  const base = existing ? [...existing] : [];
  if (!base.includes(nextEntry)) {
    base.push(nextEntry);
  }
  return base;
};

const composeMeetingTranscript = (session: MeetingSession): string => {
  const lines = session.segments.map((segment) => `${segment.speaker.toUpperCase()}: ${segment.text}`);
  return lines.join('\n');
};

export interface MeetingKnowledgeIntegrationResult {
  ingestion: IngestKnowledgeResult;
  activityEventId: string;
}

export const integrateMeetingTranscriptToKnowledge = (
  payload: {
    session: MeetingSession;
    threadId?: string;
    nowIso?: string;
  },
  dependencies: {
    knowledgeStore?: KnowledgeGraphStore;
    activityStore?: ActivityStore;
  } = {}
): MeetingKnowledgeIntegrationResult | null => {
  if (!payload.session.segments || payload.session.segments.length === 0) {
    return null;
  }

  const nowIso = payload.nowIso ?? new Date().toISOString();
  const transcript = composeMeetingTranscript(payload.session);
  const title = cleanText(`Meeting Transcript: ${payload.session.title}`);

  const ingestion = ingestKnowledgeNote(
    {
      userId: payload.session.userId,
      title,
      text: transcript,
      nowIso,
      tags: [
        'meeting-transcript',
        payload.session.status === 'ended' ? 'meeting-ended' : 'meeting-active',
      ],
    },
    dependencies.knowledgeStore ?? defaultKnowledgeStore
  );

  const activity = emitActivityEvent(
    {
      userId: payload.session.userId,
      category: 'knowledge',
      eventType: 'knowledge.meeting_transcript_ingested',
      title: 'Meeting transcript ingested',
      description: `Meeting transcript "${payload.session.title}" ingested with ${ingestion.nodes.length} chunk(s).`,
      threadId: payload.threadId,
      createdAtIso: nowIso,
      metadata: {
        segment_count: payload.session.segments.length,
        decision_count: payload.session.extracted?.decisions.length ?? 0,
        action_item_count: payload.session.extracted?.actionItems.length ?? 0,
      },
    },
    dependencies.activityStore ?? defaultActivityStore
  );

  return {
    ingestion,
    activityEventId: activity.id,
  };
};

interface ConversationHistoryRepository {
  getMessages: MessageRepository['getMessages'];
  saveMessages: MessageRepository['saveMessages'];
  appendGenerationLog?: MessageRepository['appendGenerationLog'];
}

export const appendTtsPlaybackToConversationHistory = async (
  payload: {
    userId: string;
    sessionId: string;
    messageId: string;
    engine: 'web_speech' | 'gemini_tts';
    voiceName?: string;
    nowIso?: string;
  },
  dependencies: {
    repository?: ConversationHistoryRepository;
    activityStore?: ActivityStore;
  } = {}
): Promise<{
  updated: boolean;
  activityEventId?: string;
}> => {
  const repository = dependencies.repository ?? defaultMessageRepository;
  const activityStore = dependencies.activityStore ?? defaultActivityStore;
  const nowIso = payload.nowIso ?? new Date().toISOString();

  const messages = await repository.getMessages(payload.sessionId);
  if (!messages || messages.length === 0) {
    return { updated: false };
  }

  const targetIndex = messages.findIndex((message) => message.id === payload.messageId);
  if (targetIndex < 0) {
    return { updated: false };
  }

  const logEntry = cleanText(
    `tts_played:${payload.engine}:${payload.voiceName || 'default'}:${nowIso}`
  );

  if (repository.appendGenerationLog) {
    const updated = await repository.appendGenerationLog(payload.sessionId, {
      messageId: payload.messageId,
      logEntry,
      touchUpdatedAt: false,
    });
    if (!updated) {
      return { updated: false };
    }
  } else {
    const updatedMessages: Message[] = messages.map((message, index) => {
      if (index !== targetIndex) return message;
      return {
        ...message,
        generationLogs: mergeGenerationLog(message.generationLogs, logEntry),
      };
    });

    await repository.saveMessages(payload.sessionId, updatedMessages, {
      touchUpdatedAt: false,
    });
  }

  const event = emitActivityEvent(
    {
      userId: payload.userId,
      category: 'chat',
      eventType: 'chat.tts_playback_logged',
      title: 'TTS playback logged',
      description: `Assistant response ${payload.messageId} played via ${payload.engine}.`,
      threadId: payload.sessionId,
      createdAtIso: nowIso,
      metadata: {
        engine: payload.engine,
        voice: payload.voiceName || 'default',
      },
    },
    activityStore
  );

  return {
    updated: true,
    activityEventId: event.id,
  };
};

export const appendCameraContextDecisionEvidence = (
  payload: {
    userId: string;
    matrixId: string;
    contextText: string;
    sourceId: string;
    score?: number;
    threadId?: string;
    timestampIso?: string;
    provenanceMessageIds?: string[];
  },
  dependencies: {
    evidenceStore?: DecisionEvidenceStore;
    activityStore?: ActivityStore;
  } = {}
): DecisionEvidence => {
  const timestampIso = payload.timestampIso ?? new Date().toISOString();
  const evidence: DecisionEvidence = {
    id: makeId('decision-camera-evidence'),
    type: 'knowledge',
    content: cleanText(payload.contextText),
    score: Math.max(0, Math.min(1, payload.score ?? 0.72)),
    timestamp_iso: timestampIso,
    source_id: payload.sourceId,
    provenance_message_ids: payload.provenanceMessageIds ? [...payload.provenanceMessageIds] : [],
  };

  appendDecisionEvidence(
    {
      userId: payload.userId,
      matrixId: payload.matrixId,
      evidence,
    },
    dependencies.evidenceStore ?? defaultDecisionEvidenceStore
  );

  emitActivityEvent(
    {
      userId: payload.userId,
      category: 'decision',
      eventType: 'decision.camera_context_ingested',
      title: 'Camera context ingested',
      description: `Camera context added to decision evidence for matrix ${payload.matrixId}.`,
      threadId: payload.threadId,
      createdAtIso: timestampIso,
      metadata: {
        source_id: payload.sourceId,
      },
    },
    dependencies.activityStore ?? defaultActivityStore
  );

  return evidence;
};
