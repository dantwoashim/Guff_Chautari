import { ActivityStore, activityStore } from './store';
import type { ActivityEvent, ActivityEventInput, TimelineFilter } from './types';

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

const includesTerm = (event: ActivityEvent, term: string): boolean => {
  const lowered = term.toLowerCase();
  return (
    event.title.toLowerCase().includes(lowered) ||
    event.description.toLowerCase().includes(lowered) ||
    event.eventType.toLowerCase().includes(lowered)
  );
};

export const emitActivityEvent = (
  input: ActivityEventInput,
  store: ActivityStore = activityStore
): ActivityEvent => {
  const createdAtIso = input.createdAtIso ?? new Date().toISOString();
  const event: ActivityEvent = {
    id: makeId('activity'),
    userId: input.userId,
    category: input.category,
    eventType: input.eventType,
    title: input.title,
    description: input.description,
    createdAtIso,
    threadId: input.threadId,
    metadata: input.metadata,
  };

  store.append(input.userId, event);
  return event;
};

export const listActivityEvents = (
  payload: {
    userId: string;
    filter?: TimelineFilter;
    offset?: number;
    limit?: number;
  },
  store: ActivityStore = activityStore
): ActivityEvent[] => {
  const filter = payload.filter;
  const categories = filter?.categories && filter.categories.length > 0 ? new Set(filter.categories) : null;
  const term = filter?.searchTerm?.trim().toLowerCase() ?? '';
  const fromMs = filter?.dateFromIso ? toMs(filter.dateFromIso) : null;
  const toMsLimit = filter?.dateToIso ? toMs(filter.dateToIso) : null;

  const sorted = [...store.list(payload.userId)].sort(
    (left, right) => toMs(right.createdAtIso) - toMs(left.createdAtIso)
  );

  const filtered = sorted.filter((event) => {
    const eventMs = toMs(event.createdAtIso);
    if (categories && !categories.has(event.category)) return false;
    if (term && !includesTerm(event, term)) return false;
    if (fromMs !== null && eventMs < fromMs) return false;
    if (toMsLimit !== null && eventMs > toMsLimit) return false;
    return true;
  });

  const offset = Math.max(0, payload.offset ?? 0);
  const limit = Math.max(1, payload.limit ?? 60);
  return filtered.slice(offset, offset + limit);
};
