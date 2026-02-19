import type {
  RenderedTimeline,
  TemporalMemoryIndex,
  TimelineBucket,
  TimelineEvent,
  TimelineGranularity,
  TimelineLane,
  TimelineRenderLane,
} from './types';
import { TIMELINE_LANES } from './types';
import { endOfWeekIso, startOfDayIso, startOfWeekIso } from './temporalIndex';

interface RenderTimelineInput {
  index: TemporalMemoryIndex;
  granularity?: TimelineGranularity;
  lanes?: ReadonlyArray<TimelineLane>;
  searchTerm?: string;
  dateFromIso?: string;
  dateToIso?: string;
}

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const laneLabel: Record<TimelineLane, string> = {
  beliefs: 'Beliefs',
  goals: 'Goals',
  emotion: 'Emotional Arc',
  knowledge: 'Knowledge',
  decisions: 'Decisions',
};

const startOfMonthIso = (iso: string): string => {
  const date = new Date(iso);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const endOfMonthIso = (monthStartIso: string): string => {
  const date = new Date(monthStartIso);
  date.setMonth(date.getMonth() + 1);
  date.setMilliseconds(-1);
  return date.toISOString();
};

const startOfQuarterIso = (iso: string): string => {
  const date = new Date(iso);
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
  date.setMonth(quarterMonth, 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const endOfQuarterIso = (quarterStartIso: string): string => {
  const date = new Date(quarterStartIso);
  date.setMonth(date.getMonth() + 3);
  date.setMilliseconds(-1);
  return date.toISOString();
};

const bucketWindow = (
  granularity: TimelineGranularity,
  occurredAtIso: string
): { startIso: string; endIso: string; label: string } => {
  if (granularity === 'day') {
    const startIso = startOfDayIso(occurredAtIso);
    return {
      startIso,
      endIso: new Date(toMs(startIso) + 24 * 60 * 60 * 1000 - 1).toISOString(),
      label: new Date(startIso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
    };
  }

  if (granularity === 'week') {
    const startIso = startOfWeekIso(occurredAtIso);
    return {
      startIso,
      endIso: endOfWeekIso(startIso),
      label: `Week of ${new Date(startIso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })}`,
    };
  }

  if (granularity === 'month') {
    const startIso = startOfMonthIso(occurredAtIso);
    return {
      startIso,
      endIso: endOfMonthIso(startIso),
      label: new Date(startIso).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    };
  }

  const startIso = startOfQuarterIso(occurredAtIso);
  const quarter = Math.floor(new Date(startIso).getMonth() / 3) + 1;
  return {
    startIso,
    endIso: endOfQuarterIso(startIso),
    label: `Q${quarter} ${new Date(startIso).getFullYear()}`,
  };
};

const includesTerm = (event: TimelineEvent, term: string): boolean => {
  const lowered = term.toLowerCase();
  return (
    event.title.toLowerCase().includes(lowered) ||
    event.summary.toLowerCase().includes(lowered) ||
    event.topic.toLowerCase().includes(lowered)
  );
};

const makeLaneRows = (events: ReadonlyArray<TimelineEvent>, lanes: ReadonlyArray<TimelineLane>): TimelineRenderLane[] => {
  return lanes.map((lane) => ({
    lane,
    label: laneLabel[lane],
    events: events.filter((event) => event.lane === lane),
  }));
};

const makeBuckets = (
  events: ReadonlyArray<TimelineEvent>,
  granularity: TimelineGranularity
): TimelineBucket[] => {
  const map = new Map<string, TimelineBucket>();

  for (const event of events) {
    const window = bucketWindow(granularity, event.occurredAtIso);
    const key = `${granularity}:${window.startIso}`;
    const bucket = map.get(key) ?? {
      key,
      label: window.label,
      startIso: window.startIso,
      endIso: window.endIso,
      eventIds: [],
    };

    bucket.eventIds.push(event.id);
    map.set(key, bucket);
  }

  return Array.from(map.values()).sort((left, right) => toMs(left.startIso) - toMs(right.startIso));
};

export const renderTimeline = (payload: RenderTimelineInput): RenderedTimeline => {
  const granularity = payload.granularity ?? 'week';
  const laneFilter =
    payload.lanes && payload.lanes.length > 0
      ? payload.lanes.filter((lane): lane is TimelineLane => TIMELINE_LANES.includes(lane))
      : TIMELINE_LANES;
  const searchTerm = payload.searchTerm?.trim() ?? '';

  const dateFromMs = payload.dateFromIso ? toMs(payload.dateFromIso) : null;
  const dateToMs = payload.dateToIso ? toMs(payload.dateToIso) : null;

  const filtered = payload.index.events
    .filter((event) => laneFilter.includes(event.lane))
    .filter((event) => (searchTerm ? includesTerm(event, searchTerm) : true))
    .filter((event) => {
      const eventMs = toMs(event.occurredAtIso);
      if (dateFromMs !== null && eventMs < dateFromMs) return false;
      if (dateToMs !== null && eventMs > dateToMs) return false;
      return true;
    })
    .sort((left, right) => toMs(left.occurredAtIso) - toMs(right.occurredAtIso));

  return {
    generatedAtIso: payload.index.generatedAtIso,
    granularity,
    filtersApplied: {
      lanes: [...laneFilter],
      searchTerm,
      dateFromIso: payload.dateFromIso,
      dateToIso: payload.dateToIso,
    },
    lanes: makeLaneRows(filtered, laneFilter),
    buckets: makeBuckets(filtered, granularity),
    events: filtered,
  };
};
