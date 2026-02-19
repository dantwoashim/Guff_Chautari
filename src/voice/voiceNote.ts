import { emitActivityEvent, type ActivityStore, activityStore as defaultActivityStore } from '../activity';
import {
  ingestKnowledgeNote,
  type IngestKnowledgeResult,
  type KnowledgeGraphStore,
  knowledgeGraphStore as defaultKnowledgeStore,
} from '../knowledge';
import { transcribeAudio } from '../../services/geminiService';

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'with',
  'this',
  'from',
  'your',
  'about',
  'have',
  'will',
  'just',
  'into',
  'after',
  'before',
  'need',
  'needs',
  'note',
  'voice',
  'today',
  'there',
  'their',
  'them',
  'they',
  'what',
  'when',
  'where',
  'which',
]);

export type VoiceNoteEmotionalTone =
  | 'calm'
  | 'neutral'
  | 'positive'
  | 'negative'
  | 'excited'
  | 'anxious'
  | 'frustrated';

export interface VoiceNoteIngestionResult {
  transcript: string;
  topics: string[];
  emotionalTone: VoiceNoteEmotionalTone;
  ingestion: IngestKnowledgeResult;
  activityEventIds: string[];
}

type VoiceNoteTranscriber = (payload: { audioBase64: string; mimeType: string }) => Promise<string>;
type TopicDetector = (transcript: string, maxTopics: number) => string[];
type EmotionDetector = (transcript: string) => VoiceNoteEmotionalTone;

interface VoiceNoteDependencies {
  transcriber?: VoiceNoteTranscriber;
  knowledgeStore?: KnowledgeGraphStore;
  activityStore?: ActivityStore;
  topicDetector?: TopicDetector;
  emotionDetector?: EmotionDetector;
  nowIso?: () => string;
}

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const defaultTranscriber: VoiceNoteTranscriber = async ({ audioBase64, mimeType }) =>
  transcribeAudio(audioBase64, mimeType);

const countTopics = (transcript: string): Map<string, number> => {
  const counts = new Map<string, number>();
  const tokens = transcript
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
};

export const detectVoiceNoteTopics: TopicDetector = (transcript, maxTopics = 5) => {
  const counts = countTopics(transcript);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, Math.max(1, maxTopics))
    .map(([token]) => token);
};

const positiveSignals = [
  'great',
  'good',
  'happy',
  'excited',
  'optimistic',
  'grateful',
  'progress',
  'win',
  'successful',
];
const negativeSignals = [
  'bad',
  'sad',
  'upset',
  'angry',
  'frustrated',
  'stressed',
  'blocked',
  'worried',
  'anxious',
];
const anxiousSignals = ['anxious', 'worried', 'uncertain', 'nervous', 'panic'];
const excitedSignals = ['excited', 'thrilled', 'pumped', 'energized', 'celebrate'];
const calmSignals = ['calm', 'steady', 'grounded', 'stable', 'peaceful'];
const frustratedSignals = ['frustrated', 'blocked', 'stuck', 'annoyed', 'irritated'];

const countMatches = (transcript: string, signals: readonly string[]): number => {
  const lowered = transcript.toLowerCase();
  return signals.filter((signal) => lowered.includes(signal)).length;
};

export const detectVoiceNoteEmotionalTone: EmotionDetector = (transcript) => {
  const normalized = cleanText(transcript).toLowerCase();
  if (!normalized) return 'neutral';

  const anxiousScore = countMatches(normalized, anxiousSignals);
  const excitedScore = countMatches(normalized, excitedSignals);
  const frustratedScore = countMatches(normalized, frustratedSignals);
  const calmScore = countMatches(normalized, calmSignals);
  const positiveScore = countMatches(normalized, positiveSignals);
  const negativeScore = countMatches(normalized, negativeSignals);

  if (frustratedScore > 0) return 'frustrated';
  if (anxiousScore > 0) return 'anxious';
  if (excitedScore > 0) return 'excited';
  if (calmScore > 0) return 'calm';
  if (positiveScore > negativeScore) return 'positive';
  if (negativeScore > positiveScore) return 'negative';
  return 'neutral';
};

const dedupeTags = (tags: ReadonlyArray<string>): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    const trimmed = cleanText(tag);
    if (!trimmed) continue;
    const lowered = trimmed.toLowerCase();
    if (seen.has(lowered)) continue;
    seen.add(lowered);
    normalized.push(trimmed);
  }
  return normalized;
};

export const transcribeVoiceAudio = async (
  payload: {
    audioBase64: string;
    mimeType: string;
  },
  dependencies: Pick<VoiceNoteDependencies, 'transcriber'> = {}
): Promise<string> => {
  const transcriber = dependencies.transcriber ?? defaultTranscriber;
  const transcript = cleanText(
    await transcriber({
      audioBase64: payload.audioBase64,
      mimeType: payload.mimeType,
    })
  );
  if (!transcript) {
    throw new Error('Voice note transcription returned empty text.');
  }
  return transcript;
};

export const blobToBase64Audio = async (
  blob: Blob
): Promise<{
  audioBase64: string;
  mimeType: string;
}> => {
  const mimeType = blob.type || 'audio/webm';
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return {
      audioBase64: btoa(binary),
      mimeType,
    };
  }
  if (typeof Buffer !== 'undefined') {
    return {
      audioBase64: Buffer.from(bytes).toString('base64'),
      mimeType,
    };
  }
  throw new Error('Base64 conversion is unavailable in this environment.');
};

export const ingestVoiceNote = async (
  payload: {
    userId: string;
    audioBase64: string;
    mimeType: string;
    title?: string;
    threadId?: string;
    tags?: string[];
    nowIso?: string;
  },
  dependencies: VoiceNoteDependencies = {}
): Promise<VoiceNoteIngestionResult> => {
  const nowIso = payload.nowIso ?? dependencies.nowIso?.() ?? new Date().toISOString();
  const transcript = await transcribeVoiceAudio(payload, dependencies);
  const topicDetector = dependencies.topicDetector ?? detectVoiceNoteTopics;
  const emotionDetector = dependencies.emotionDetector ?? detectVoiceNoteEmotionalTone;

  const topics = topicDetector(transcript, 6);
  const emotionalTone = emotionDetector(transcript);
  const tags = dedupeTags([
    'voice-note',
    `tone:${emotionalTone}`,
    ...topics.map((topic) => `topic:${topic}`),
    ...(payload.tags ?? []),
  ]);

  const knowledgeStore = dependencies.knowledgeStore ?? defaultKnowledgeStore;
  const activityStore = dependencies.activityStore ?? defaultActivityStore;
  const title = cleanText(payload.title ?? '') || `Voice Note ${nowIso}`;
  const ingestion = ingestKnowledgeNote(
    {
      userId: payload.userId,
      title,
      text: transcript,
      nowIso,
      tags,
    },
    knowledgeStore
  );

  const knowledgeEvent = emitActivityEvent(
    {
      userId: payload.userId,
      category: 'knowledge',
      eventType: 'knowledge.voice_note_ingested',
      title: 'Voice note ingested',
      description: `Ingested "${ingestion.source.title}" (${ingestion.nodes.length} chunk(s), tone: ${emotionalTone}).`,
      threadId: payload.threadId,
      createdAtIso: nowIso,
      metadata: {
        tone: emotionalTone,
        chunk_count: ingestion.nodes.length,
        topic_count: topics.length,
      },
    },
    activityStore
  );

  const timelineEvent = emitActivityEvent(
    {
      userId: payload.userId,
      category: 'chat',
      eventType: 'chat.voice_note_transcribed',
      title: 'Voice note transcribed',
      description: `Transcript captured (${transcript.length} chars).`,
      threadId: payload.threadId,
      createdAtIso: nowIso,
      metadata: {
        tone: emotionalTone,
      },
    },
    activityStore
  );

  return {
    transcript,
    topics,
    emotionalTone,
    ingestion,
    activityEventIds: [knowledgeEvent.id, timelineEvent.id],
  };
};

export const ingestVoiceNoteBlob = async (
  payload: {
    userId: string;
    audioBlob: Blob;
    title?: string;
    threadId?: string;
    tags?: string[];
    nowIso?: string;
  },
  dependencies: VoiceNoteDependencies = {}
): Promise<VoiceNoteIngestionResult> => {
  const encoded = await blobToBase64Audio(payload.audioBlob);
  return ingestVoiceNote(
    {
      userId: payload.userId,
      audioBase64: encoded.audioBase64,
      mimeType: encoded.mimeType,
      title: payload.title,
      threadId: payload.threadId,
      tags: payload.tags,
      nowIso: payload.nowIso,
    },
    dependencies
  );
};
