import type {
  MeetingActionExtraction,
  MeetingActionItem,
  MeetingDecision,
  MeetingQuestion,
  MeetingTopic,
} from './types';

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'with',
  'from',
  'this',
  'have',
  'will',
  'your',
  'about',
  'into',
  'after',
  'before',
  'over',
  'under',
  'they',
  'them',
  'their',
  'then',
  'than',
  'just',
  'were',
  'been',
  'being',
  'should',
  'would',
  'could',
  'there',
  'where',
  'what',
  'when',
  'which',
  'while',
  'also',
  'need',
  'needs',
  'meeting',
  'session',
]);

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

const parseAssignee = (text: string): string | undefined => {
  const ownerMatch = text.match(
    /(?:owner|assignee|assigned to)\s*[:\-]\s*([a-zA-Z0-9@._ -]{2,40})/i
  );
  if (ownerMatch) return cleanText(ownerMatch[1]);

  const mentionMatch = text.match(/@([a-zA-Z0-9_.-]{2,30})/);
  if (mentionMatch) return cleanText(mentionMatch[1]);

  const leadingNameMatch = text.match(/^([A-Z][a-zA-Z0-9_-]{1,30})\s+(?:will|to)\b/);
  if (leadingNameMatch) return cleanText(leadingNameMatch[1]);

  return undefined;
};

const nextWeekdayIso = (weekday: number, nowIso: string): string => {
  const date = new Date(nowIso);
  date.setHours(9, 0, 0, 0);
  const currentWeekday = date.getDay();
  let delta = weekday - currentWeekday;
  if (delta <= 0) delta += 7;
  date.setDate(date.getDate() + delta);
  return date.toISOString();
};

const parseDeadlineIso = (text: string, nowIso: string): string | undefined => {
  const isoDate = text.match(/\b(20\d{2}-\d{2}-\d{2})(?:[tT ](\d{2}:\d{2}(?::\d{2})?))?\b/);
  if (isoDate) {
    const raw = isoDate[2] ? `${isoDate[1]}T${isoDate[2]}` : `${isoDate[1]}T09:00:00`;
    const parsed = new Date(raw).toISOString();
    if (!Number.isNaN(Date.parse(parsed))) return parsed;
  }

  const byDateMatch = text.match(
    /\bby\s+([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*20\d{2})?|\d{1,2}\/\d{1,2}(?:\/20\d{2})?)\b/i
  );
  if (byDateMatch) {
    const parsed = Date.parse(byDateMatch[1]);
    if (!Number.isNaN(parsed)) {
      const date = new Date(parsed);
      if (!/\d{1,2}:\d{2}/.test(byDateMatch[1])) {
        date.setHours(9, 0, 0, 0);
      }
      return date.toISOString();
    }
  }

  if (/\btomorrow\b/i.test(text)) {
    const date = new Date(nowIso);
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return date.toISOString();
  }

  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  for (const [label, day] of Object.entries(weekdays)) {
    const regex = new RegExp(`\\bby\\s+${label}\\b`, 'i');
    if (regex.test(text)) {
      return nextWeekdayIso(day, nowIso);
    }
  }

  return undefined;
};

const looksLikeDecision = (text: string): boolean =>
  /\b(decision|decided|agreed|approved|resolved|we will|we should)\b/i.test(text);

const looksLikeActionItem = (text: string): boolean =>
  /\b(action item|todo|to-do|to do|follow up|follow-up|send|schedule|prepare|create|deliver|draft|assign|ship)\b/i.test(
    text
  );

const looksLikeQuestion = (text: string): boolean =>
  text.includes('?') || /\b(open question|question)\b/i.test(text);

const isResolvedQuestion = (text: string): boolean =>
  /\b(resolved|answered|closed)\b/i.test(text);

const normalizeLines = (
  transcript: string,
  segmentHints?: ReadonlyArray<{ id: string; text: string }>
): Array<{ id: string; text: string }> => {
  if (segmentHints && segmentHints.length > 0) {
    return segmentHints
      .map((segment) => ({
        id: segment.id,
        text: cleanText(segment.text),
      }))
      .filter((segment) => segment.text.length > 0);
  }

  const chunks = transcript
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter((line) => line.length > 0);

  return chunks.map((text, index) => ({
    id: `line-${index + 1}`,
    text,
  }));
};

const computeTopics = (transcript: string, maxTopics = 6): MeetingTopic[] => {
  const counts = new Map<string, number>();
  for (const token of tokenize(transcript)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, maxTopics);
  if (top.length === 0) {
    return [
      {
        id: makeId('meeting-topic'),
        label: 'general',
        score: 0.2,
      },
    ];
  }

  const maxCount = Math.max(...top.map((entry) => entry[1]), 1);
  return top.map(([token, count]) => ({
    id: makeId('meeting-topic'),
    label: token,
    score: Number(clamp(count / maxCount, 0, 1).toFixed(4)),
  }));
};

const dedupeByText = <T extends { text: string }>(items: ReadonlyArray<T>): T[] => {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const key = cleanText(item.text).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
};

type StructuredValueRecord = Record<string, unknown>;

interface StructuredMeetingActionExtraction {
  decisions?: unknown[];
  actionItems?: unknown[];
  questions?: unknown[];
  topics?: unknown[];
}

const asRecord = (value: unknown): StructuredValueRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as StructuredValueRecord;
};

const readString = (record: StructuredValueRecord, key: string): string => {
  const value = record[key];
  return typeof value === 'string' ? cleanText(value) : '';
};

const readNumber = (record: StructuredValueRecord, key: string): number | null => {
  const value = record[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const readBoolean = (record: StructuredValueRecord, key: string): boolean | null => {
  const value = record[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^(true|yes|1)$/i.test(value)) return true;
    if (/^(false|no|0)$/i.test(value)) return false;
  }
  return null;
};

const isNonNullable = <T>(value: T | null): value is T => value !== null;

const extractHeuristically = (payload: {
  transcript: string;
  nowIso: string;
  segmentHints?: ReadonlyArray<{ id: string; text: string }>;
}): MeetingActionExtraction => {
  const lines = normalizeLines(payload.transcript, payload.segmentHints);

  const decisions: MeetingDecision[] = [];
  const actionItems: MeetingActionItem[] = [];
  const questions: MeetingQuestion[] = [];

  for (const line of lines) {
    if (looksLikeDecision(line.text)) {
      decisions.push({
        id: makeId('meeting-decision'),
        text: line.text,
        confidence: 0.72,
        sourceSegmentId: line.id,
      });
    }

    if (looksLikeActionItem(line.text)) {
      actionItems.push({
        id: makeId('meeting-action'),
        text: line.text,
        assignee: parseAssignee(line.text),
        deadlineIso: parseDeadlineIso(line.text, payload.nowIso),
        confidence: 0.68,
        sourceSegmentId: line.id,
      });
    }

    if (looksLikeQuestion(line.text)) {
      questions.push({
        id: makeId('meeting-question'),
        text: line.text,
        resolved: isResolvedQuestion(line.text),
        sourceSegmentId: line.id,
      });
    }
  }

  return {
    decisions: dedupeByText(decisions),
    actionItems: dedupeByText(actionItems),
    questions: dedupeByText(questions),
    topics: computeTopics(payload.transcript),
    method: 'heuristic',
    generatedAtIso: payload.nowIso,
  };
};

const isValidStructuredExtraction = (
  value: StructuredMeetingActionExtraction | null
): value is StructuredMeetingActionExtraction => {
  if (!value || typeof value !== 'object') return false;
  const decisions = Array.isArray(value.decisions) ? value.decisions : null;
  const actionItems = Array.isArray(value.actionItems) ? value.actionItems : null;
  const questions = Array.isArray(value.questions) ? value.questions : null;
  const topics = Array.isArray(value.topics) ? value.topics : null;
  return Boolean(decisions || actionItems || questions || topics);
};

const normalizeStructuredDecision = (value: unknown): MeetingDecision | null => {
  const record = asRecord(value);
  if (!record) return null;

  const text = readString(record, 'text');
  if (!text) return null;

  const confidence = readNumber(record, 'confidence');
  const sourceSegmentId = readString(record, 'sourceSegmentId') || undefined;

  return {
    id: makeId('meeting-decision'),
    text,
    confidence: Number(clamp(confidence ?? 0.78, 0, 1).toFixed(4)),
    sourceSegmentId,
  };
};

const normalizeStructuredActionItem = (value: unknown, nowIso: string): MeetingActionItem | null => {
  const record = asRecord(value);
  if (!record) return null;

  const text = readString(record, 'text');
  if (!text) return null;

  const assignee = readString(record, 'assignee') || undefined;
  const rawDeadline =
    readString(record, 'deadlineIso') || readString(record, 'deadline');
  let deadlineIso: string | undefined;
  if (rawDeadline) {
    const parsed = Date.parse(rawDeadline);
    if (!Number.isNaN(parsed)) {
      deadlineIso = new Date(parsed).toISOString();
    } else {
      deadlineIso = parseDeadlineIso(rawDeadline, nowIso);
    }
  }
  return {
    id: makeId('meeting-action'),
    text,
    assignee,
    deadlineIso,
    confidence: Number(clamp(readNumber(record, 'confidence') ?? 0.75, 0, 1).toFixed(4)),
    sourceSegmentId: readString(record, 'sourceSegmentId') || undefined,
  };
};

const normalizeStructuredQuestion = (value: unknown): MeetingQuestion | null => {
  const record = asRecord(value);
  if (!record) return null;

  const text = readString(record, 'text');
  if (!text) return null;
  return {
    id: makeId('meeting-question'),
    text,
    resolved: readBoolean(record, 'resolved') ?? false,
    sourceSegmentId: readString(record, 'sourceSegmentId') || undefined,
  };
};

const normalizeStructuredTopic = (value: unknown): MeetingTopic | null => {
  const record = asRecord(value);
  if (!record) return null;

  const label = readString(record, 'label') || readString(record, 'topic');
  if (!label) return null;
  return {
    id: makeId('meeting-topic'),
    label,
    score: Number(clamp(readNumber(record, 'score') ?? 0.7, 0, 1).toFixed(4)),
  };
};

const normalizeStructuredExtraction = (payload: {
  value: StructuredMeetingActionExtraction;
  nowIso: string;
}): MeetingActionExtraction => {
  const decisions = Array.isArray(payload.value.decisions)
    ? payload.value.decisions.map(normalizeStructuredDecision).filter(isNonNullable)
    : [];
  const actionItems = Array.isArray(payload.value.actionItems)
    ? payload.value.actionItems
        .map((item) => normalizeStructuredActionItem(item, payload.nowIso))
        .filter(isNonNullable)
    : [];
  const questions = Array.isArray(payload.value.questions)
    ? payload.value.questions.map(normalizeStructuredQuestion).filter(isNonNullable)
    : [];
  const topics = Array.isArray(payload.value.topics)
    ? payload.value.topics.map(normalizeStructuredTopic).filter(isNonNullable)
    : [];

  return {
    decisions: dedupeByText(decisions),
    actionItems: dedupeByText(actionItems),
    questions: dedupeByText(questions),
    topics,
    method: 'structured_llm',
    generatedAtIso: payload.nowIso,
  };
};

export interface StructuredActionExtractorClient {
  extractStructured: (payload: {
    transcript: string;
    schemaVersion: string;
    instructions: string;
  }) => Promise<StructuredMeetingActionExtraction | null>;
}

const structuredInstructions = [
  'Extract structured meeting outputs from transcript text.',
  'Return decisions, actionItems, questions, and topics as typed arrays.',
  'Action items should include assignee/deadline when explicitly present.',
  'Questions should be unresolved unless clearly marked resolved.',
].join(' ');

export const extractMeetingActions = async (payload: {
  transcript: string;
  nowIso?: string;
  segmentHints?: ReadonlyArray<{ id: string; text: string }>;
  client?: StructuredActionExtractorClient;
  preferStructured?: boolean;
}): Promise<MeetingActionExtraction> => {
  const transcript = payload.transcript;
  if (!cleanText(transcript)) {
    throw new Error('Transcript is required for action extraction.');
  }

  const nowIso = payload.nowIso ?? new Date().toISOString();
  const heuristic = extractHeuristically({
    transcript,
    nowIso,
    segmentHints: payload.segmentHints,
  });

  const preferStructured = payload.preferStructured ?? true;
  if (!preferStructured || !payload.client) {
    return heuristic;
  }

  const structuredRaw = await payload.client.extractStructured({
    transcript,
    schemaVersion: 'meeting_actions.v1',
    instructions: structuredInstructions,
  });
  if (!isValidStructuredExtraction(structuredRaw)) {
    return heuristic;
  }

  const structured = normalizeStructuredExtraction({
    value: structuredRaw,
    nowIso,
  });

  if (
    structured.decisions.length === 0 &&
    structured.actionItems.length === 0 &&
    structured.questions.length === 0
  ) {
    return heuristic;
  }

  return {
    decisions:
      structured.decisions.length > 0 ? structured.decisions : heuristic.decisions,
    actionItems:
      structured.actionItems.length > 0 ? structured.actionItems : heuristic.actionItems,
    questions:
      structured.questions.length > 0 ? structured.questions : heuristic.questions,
    topics: structured.topics.length > 0 ? structured.topics : heuristic.topics,
    method:
      structured.decisions.length > 0 &&
      structured.actionItems.length > 0 &&
      structured.questions.length > 0
        ? 'structured_llm'
        : 'hybrid',
    generatedAtIso: nowIso,
  };
};
