import type {
  BeliefChange,
  EmotionalEpoch,
  GoalEvolution,
  KnowledgeGrowthPoint,
  MemorySnapshot,
  TemporalMemoryIndex,
  TemporalWeekGroup,
  TimelineEvent,
  TimelineLane,
  TimelineSourceType,
} from './types';
import { TIMELINE_LANES } from './types';

export interface TemporalIndexMessage {
  id: string;
  text: string;
  timestamp: number;
  threadId?: string;
}

export interface TemporalIndexActivityEvent {
  id: string;
  category:
    | 'chat'
    | 'knowledge'
    | 'decision'
    | 'workflow'
    | 'reflection'
    | 'plugin'
    | 'outcome';
  eventType: string;
  title: string;
  description: string;
  createdAtIso: string;
  threadId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface EmotionalTrendPointInput {
  dateIso: string;
  valence: number;
  arousal: number;
  messageCount: number;
}

interface TemporalIndexInput {
  userId: string;
  snapshots?: ReadonlyArray<MemorySnapshot>;
  messages?: ReadonlyArray<TemporalIndexMessage>;
  activityEvents?: ReadonlyArray<TemporalIndexActivityEvent>;
  emotionalTrend?: ReadonlyArray<EmotionalTrendPointInput>;
  beliefChanges?: ReadonlyArray<BeliefChange>;
  goalEvolutions?: ReadonlyArray<GoalEvolution>;
  nowIso?: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
};

export const startOfDayIso = (iso: string): string => {
  const date = new Date(iso);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

export const startOfWeekIso = (iso: string): string => {
  const date = new Date(iso);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

export const endOfWeekIso = (weekStartIso: string): string => {
  const date = new Date(weekStartIso);
  date.setDate(date.getDate() + 7);
  date.setMilliseconds(-1);
  return date.toISOString();
};

const laneFromCategory = (
  category: TemporalIndexActivityEvent['category'],
  eventType: string
): TimelineLane => {
  if (category === 'knowledge') return 'knowledge';
  if (category === 'decision') return 'decisions';
  if (category === 'outcome') return 'goals';
  if (category === 'workflow' && eventType.includes('goal')) return 'goals';
  if (category === 'workflow') return 'goals';
  if (category === 'reflection') return 'emotion';
  return 'beliefs';
};

const inferTopicFromText = (text: string): string => {
  const lowered = text.toLowerCase();

  if (/retention|churn|activation|engagement/.test(lowered)) {
    return 'user retention';
  }

  if (/contractor|freelancer|agency|in-house|internal team|build internally|outsource/.test(lowered)) {
    return 'resourcing strategy';
  }

  if (/pricing|price|revenue|mrr/.test(lowered)) {
    return 'pricing strategy';
  }

  const aboutMatch = lowered.match(/(?:about|for|on)\s+([a-z0-9\s-]{3,60})/i);
  if (aboutMatch?.[1]) {
    return aboutMatch[1].trim().replace(/\s+/g, ' ');
  }

  return lowered
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 3)
    .slice(0, 4)
    .join(' ')
    .trim() || 'general';
};

const summarizeText = (text: string, max = 140): string => {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
};

const toMessageIso = (timestamp: number): string => {
  const asMs = Number.isFinite(timestamp) ? timestamp : Date.now();
  return new Date(asMs).toISOString();
};

const beliefSignalRegex =
  /(i\s+(?:believe|think|feel|realized|decided)\b|we\s+(?:should|need to|must)\b|i\s+care\s+about\b|we\s+care\s+about\b)/i;

const goalSignalRegex = /(goal|target|milestone|roadmap|plan\b|objective)/i;

const knowledgeSignalRegex = /(learned|discovered|found\s+that|insight|knowledge|research)/i;

const deriveSnapshotsFromMessages = (
  userId: string,
  messages: ReadonlyArray<TemporalIndexMessage>
): MemorySnapshot[] => {
  const snapshots: MemorySnapshot[] = [];

  for (const message of messages) {
    const text = message.text.trim();
    if (!text) continue;

    const occurredAtIso = toMessageIso(message.timestamp);
    const topic = inferTopicFromText(text);

    if (beliefSignalRegex.test(text)) {
      snapshots.push({
        id: `snapshot-msg-belief-${message.id}`,
        userId,
        occurredAtIso,
        lane: 'beliefs',
        topic,
        summary: summarizeText(text),
        sourceType: 'message',
        sourceId: message.id,
        threadId: message.threadId,
        confidence: 0.7,
      });
    }

    if (goalSignalRegex.test(text)) {
      snapshots.push({
        id: `snapshot-msg-goal-${message.id}`,
        userId,
        occurredAtIso,
        lane: 'goals',
        topic,
        summary: summarizeText(text),
        sourceType: 'message',
        sourceId: message.id,
        threadId: message.threadId,
        confidence: 0.62,
      });
    }

    if (knowledgeSignalRegex.test(text)) {
      snapshots.push({
        id: `snapshot-msg-knowledge-${message.id}`,
        userId,
        occurredAtIso,
        lane: 'knowledge',
        topic,
        summary: summarizeText(text),
        sourceType: 'message',
        sourceId: message.id,
        threadId: message.threadId,
        confidence: 0.58,
      });
    }
  }

  return snapshots;
};

const deriveSnapshotsFromActivityEvents = (
  userId: string,
  events: ReadonlyArray<TemporalIndexActivityEvent>
): MemorySnapshot[] => {
  return events.map((event) => {
    const lane = laneFromCategory(event.category, event.eventType);
    const topic =
      (typeof event.metadata?.goal_title === 'string' && event.metadata.goal_title) ||
      (typeof event.metadata?.topic === 'string' && event.metadata.topic) ||
      inferTopicFromText(`${event.title} ${event.description}`);

    const sourceType: TimelineSourceType =
      event.category === 'decision' ? 'decision' : event.category === 'outcome' ? 'manual' : 'activity';

    return {
      id: `snapshot-activity-${event.id}`,
      userId,
      occurredAtIso: event.createdAtIso,
      lane,
      topic,
      summary: summarizeText(`${event.title}. ${event.description}`),
      sourceType,
      sourceId: event.id,
      threadId: event.threadId,
      confidence: 0.65,
      metadata: {
        ...event.metadata,
        event_type: event.eventType,
      },
    } satisfies MemorySnapshot;
  });
};

const deriveSnapshotsFromEmotionalTrend = (
  userId: string,
  points: ReadonlyArray<EmotionalTrendPointInput>
): MemorySnapshot[] => {
  return points.map((point) => ({
    id: `snapshot-emotion-${startOfDayIso(point.dateIso)}`,
    userId,
    occurredAtIso: point.dateIso,
    lane: 'emotion',
    topic: 'emotional baseline',
    summary: `Valence ${Math.round(point.valence * 100)}%, arousal ${Math.round(point.arousal * 100)}%.`,
    sourceType: 'analytics',
    sourceId: startOfDayIso(point.dateIso),
    emotionalValence: clamp01(point.valence),
    confidence: 0.72,
    metadata: {
      arousal: clamp01(point.arousal),
      message_count: Math.max(0, Math.round(point.messageCount)),
    },
  }));
};

const uniqueById = (entries: ReadonlyArray<MemorySnapshot>): MemorySnapshot[] => {
  const map = new Map<string, MemorySnapshot>();
  for (const entry of entries) {
    map.set(entry.id, entry);
  }
  return Array.from(map.values());
};

const timelineTitle = (snapshot: MemorySnapshot): string => {
  if (snapshot.lane === 'beliefs') return `Belief signal: ${snapshot.topic}`;
  if (snapshot.lane === 'goals') return `Goal signal: ${snapshot.topic}`;
  if (snapshot.lane === 'emotion') return 'Emotional baseline updated';
  if (snapshot.lane === 'knowledge') return `Knowledge growth: ${snapshot.topic}`;
  return `Decision context: ${snapshot.topic}`;
};

const timelineWhy = (snapshot: MemorySnapshot): string => {
  if (snapshot.sourceType === 'message') return 'Derived from a conversation statement.';
  if (snapshot.sourceType === 'decision') return 'Derived from decision room activity.';
  if (snapshot.sourceType === 'analytics') return 'Derived from weekly emotional trend analytics.';
  return 'Derived from timeline activity events.';
};

const toTimelineEvents = (snapshots: ReadonlyArray<MemorySnapshot>): TimelineEvent[] => {
  return snapshots.map((snapshot) => ({
    id: `timeline-${snapshot.id}`,
    userId: snapshot.userId,
    lane: snapshot.lane,
    occurredAtIso: snapshot.occurredAtIso,
    title: timelineTitle(snapshot),
    summary: snapshot.summary,
    topic: snapshot.topic,
    sourceType: snapshot.sourceType,
    sourceId: snapshot.sourceId,
    threadId: snapshot.threadId,
    why: timelineWhy(snapshot),
    drillDownRefIds: [snapshot.sourceId],
    confidence: snapshot.confidence,
  }));
};

const emptyLaneCounts = (): Record<TimelineLane, number> => ({
  beliefs: 0,
  goals: 0,
  emotion: 0,
  knowledge: 0,
  decisions: 0,
});

const groupByWeek = (events: ReadonlyArray<TimelineEvent>): TemporalWeekGroup[] => {
  const map = new Map<string, TemporalWeekGroup>();

  for (const event of events) {
    const weekStartIso = startOfWeekIso(event.occurredAtIso);
    const bucket = map.get(weekStartIso) ?? {
      weekStartIso,
      weekEndIso: endOfWeekIso(weekStartIso),
      countsByLane: emptyLaneCounts(),
      eventIds: [],
    };

    bucket.countsByLane[event.lane] += 1;
    bucket.eventIds.push(event.id);
    map.set(weekStartIso, bucket);
  }

  return Array.from(map.values()).sort((left, right) => toMs(left.weekStartIso) - toMs(right.weekStartIso));
};

const toNumber = (value: string | number | boolean | null | undefined, fallback = 0): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const buildEmotionalEpochs = (
  userId: string,
  snapshots: ReadonlyArray<MemorySnapshot>
): EmotionalEpoch[] => {
  const emotionSnapshots = snapshots.filter((snapshot) => snapshot.lane === 'emotion');
  const byWeek = new Map<string, MemorySnapshot[]>();

  for (const snapshot of emotionSnapshots) {
    const weekStartIso = startOfWeekIso(snapshot.occurredAtIso);
    const entries = byWeek.get(weekStartIso) ?? [];
    entries.push(snapshot);
    byWeek.set(weekStartIso, entries);
  }

  return Array.from(byWeek.entries())
    .sort((left, right) => toMs(left[0]) - toMs(right[0]))
    .map(([weekStartIso, entries]) => {
      const valenceAvg =
        entries.reduce((sum, entry) => sum + (entry.emotionalValence ?? 0.5), 0) /
        Math.max(1, entries.length);
      const arousalAvg =
        entries.reduce((sum, entry) => sum + toNumber(entry.metadata?.arousal, 0.4), 0) /
        Math.max(1, entries.length);
      const messageCount = entries.reduce(
        (sum, entry) => sum + Math.max(0, Math.round(toNumber(entry.metadata?.message_count, 0))),
        0
      );

      const dominantState: EmotionalEpoch['dominantState'] =
        valenceAvg >= 0.58 ? 'positive' : valenceAvg <= 0.42 ? 'negative' : 'neutral';

      return {
        id: `epoch-${weekStartIso}`,
        userId,
        weekStartIso,
        weekEndIso: endOfWeekIso(weekStartIso),
        averageValence: Number(valenceAvg.toFixed(3)),
        averageArousal: Number(arousalAvg.toFixed(3)),
        dominantState,
        messageCount,
      };
    });
};

const buildKnowledgeGrowth = (snapshots: ReadonlyArray<MemorySnapshot>): KnowledgeGrowthPoint[] => {
  const knowledgeSnapshots = snapshots.filter((snapshot) => snapshot.lane === 'knowledge');
  const byWeek = new Map<string, { topics: Set<string>; count: number }>();

  for (const snapshot of knowledgeSnapshots) {
    const weekStartIso = startOfWeekIso(snapshot.occurredAtIso);
    const entry = byWeek.get(weekStartIso) ?? { topics: new Set<string>(), count: 0 };
    entry.count += 1;
    if (snapshot.topic.trim()) entry.topics.add(snapshot.topic);
    byWeek.set(weekStartIso, entry);
  }

  return Array.from(byWeek.entries())
    .sort((left, right) => toMs(left[0]) - toMs(right[0]))
    .map(([weekStartIso, entry]) => ({
      weekStartIso,
      weekEndIso: endOfWeekIso(weekStartIso),
      newItems: entry.count,
      topics: Array.from(entry.topics).slice(0, 12),
    }));
};

export const buildTemporalMemoryIndex = (payload: TemporalIndexInput): TemporalMemoryIndex => {
  const generatedAtIso = payload.nowIso ?? new Date().toISOString();

  const derivedSnapshots = [
    ...(payload.snapshots ?? []),
    ...deriveSnapshotsFromMessages(payload.userId, payload.messages ?? []),
    ...deriveSnapshotsFromActivityEvents(payload.userId, payload.activityEvents ?? []),
    ...deriveSnapshotsFromEmotionalTrend(payload.userId, payload.emotionalTrend ?? []),
  ];

  const snapshots = uniqueById(derivedSnapshots).sort(
    (left, right) => toMs(left.occurredAtIso) - toMs(right.occurredAtIso)
  );

  const events = toTimelineEvents(snapshots).sort(
    (left, right) => toMs(left.occurredAtIso) - toMs(right.occurredAtIso)
  );

  const weekGroups = groupByWeek(events);
  const emotionalEpochs = buildEmotionalEpochs(payload.userId, snapshots);
  const knowledgeGrowth = buildKnowledgeGrowth(snapshots);

  return {
    userId: payload.userId,
    generatedAtIso,
    snapshots,
    events,
    weekGroups,
    beliefChanges: [...(payload.beliefChanges ?? [])],
    goalEvolutions: [...(payload.goalEvolutions ?? [])],
    emotionalEpochs,
    knowledgeGrowth,
  };
};

export const bucketEventsByWeek = (events: ReadonlyArray<TimelineEvent>): TemporalWeekGroup[] => {
  return groupByWeek(events);
};

export const mergeTemporalIndex = (
  left: TemporalMemoryIndex,
  right: TemporalMemoryIndex,
  nowIso = new Date().toISOString()
): TemporalMemoryIndex => {
  const merged = buildTemporalMemoryIndex({
    userId: left.userId,
    snapshots: [...left.snapshots, ...right.snapshots],
    beliefChanges: [...left.beliefChanges, ...right.beliefChanges],
    goalEvolutions: [...left.goalEvolutions, ...right.goalEvolutions],
    nowIso,
  });

  return {
    ...merged,
    beliefChanges: [...left.beliefChanges, ...right.beliefChanges].sort(
      (a, b) => toMs(a.changedAtIso) - toMs(b.changedAtIso)
    ),
    goalEvolutions: [...left.goalEvolutions, ...right.goalEvolutions],
  };
};

export const estimateTemporalCoverageWeeks = (index: TemporalMemoryIndex): number => {
  if (index.events.length === 0) return 0;
  const firstMs = toMs(index.events[0].occurredAtIso);
  const lastMs = toMs(index.events[index.events.length - 1].occurredAtIso);
  if (lastMs <= firstMs) return 1;
  return Math.max(1, Math.ceil((lastMs - firstMs + 1) / WEEK_MS));
};

export const laneCount = (index: TemporalMemoryIndex): Record<TimelineLane, number> => {
  const counts = emptyLaneCounts();
  for (const event of index.events) {
    if (TIMELINE_LANES.includes(event.lane)) {
      counts[event.lane] += 1;
    }
  }
  return counts;
};
