import { ActivityStore, activityStore } from './store';
import { listActivityEvents } from './eventEmitter';
import type { ActivityCategory, ActivityTimelineGroup, WeeklyActivitySummary } from './types';

const CATEGORIES: ActivityCategory[] = [
  'chat',
  'knowledge',
  'decision',
  'workflow',
  'reflection',
  'plugin',
];

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const startOfDayIso = (iso: string): string => {
  const date = new Date(iso);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const startOfWeekIso = (iso: string): string => {
  const date = new Date(iso);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const endOfWeekIso = (startIso: string): string => {
  const date = new Date(startIso);
  date.setDate(date.getDate() + 7);
  date.setMilliseconds(-1);
  return date.toISOString();
};

const dateLabel = (iso: string): string => {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

export const groupActivityTimeline = (
  payload: {
    userId: string;
    limit?: number;
    offset?: number;
  },
  store: ActivityStore = activityStore
): ActivityTimelineGroup[] => {
  const events = listActivityEvents(
    {
      userId: payload.userId,
      limit: payload.limit ?? 120,
      offset: payload.offset ?? 0,
    },
    store
  );

  const grouped = new Map<string, ActivityTimelineGroup>();
  for (const event of events) {
    const key = startOfDayIso(event.createdAtIso);
    const existing = grouped.get(key);
    if (existing) {
      existing.events.push(event);
      continue;
    }

    grouped.set(key, {
      dateLabel: dateLabel(event.createdAtIso),
      events: [event],
    });
  }

  return Array.from(grouped.entries())
    .sort((left, right) => toMs(right[0]) - toMs(left[0]))
    .map((entry) => ({
      dateLabel: entry[1].dateLabel,
      events: entry[1].events.sort((left, right) => toMs(right.createdAtIso) - toMs(left.createdAtIso)),
    }));
};

export const summarizeWeeklyActivity = (
  payload: {
    userId: string;
    nowIso?: string;
  },
  store: ActivityStore = activityStore
): WeeklyActivitySummary => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const weekStartIso = startOfWeekIso(nowIso);
  const weekEndIso = endOfWeekIso(weekStartIso);

  const events = listActivityEvents(
    {
      userId: payload.userId,
      filter: {
        dateFromIso: weekStartIso,
        dateToIso: weekEndIso,
      },
      limit: 500,
    },
    store
  );

  const countsByCategory = CATEGORIES.reduce<Record<ActivityCategory, number>>((acc, category) => {
    acc[category] = 0;
    return acc;
  }, {} as Record<ActivityCategory, number>);

  const eventTypeCounts = new Map<string, number>();

  for (const event of events) {
    countsByCategory[event.category] += 1;
    eventTypeCounts.set(event.eventType, (eventTypeCounts.get(event.eventType) ?? 0) + 1);
  }

  const topEventTypes = Array.from(eventTypeCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([eventType, count]) => ({ eventType, count }));

  return {
    weekStartIso,
    weekEndIso,
    totalEvents: events.length,
    countsByCategory,
    topEventTypes,
  };
};
