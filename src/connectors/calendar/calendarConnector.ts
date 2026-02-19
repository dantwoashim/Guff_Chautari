import type { Connector, ConnectorActionResult } from '../types';

interface MockCalendarEvent {
  id: string;
  title: string;
  startsAtIso: string;
  endsAtIso: string;
  location?: string;
  notes?: string;
  attendees?: string[];
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const defaultEvents = (): MockCalendarEvent[] => {
  const now = new Date();

  return [
    {
      id: 'event-1',
      title: 'Weekly Planning Sync',
      startsAtIso: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      endsAtIso: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      location: 'Zoom',
      notes: 'Review priorities for current sprint.',
      attendees: ['pm@example.com', 'ops@example.com'],
    },
    {
      id: 'event-2',
      title: 'Design Review',
      startsAtIso: new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString(),
      endsAtIso: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
      location: 'Room 3A',
      notes: 'Evaluate branch editor UX updates.',
      attendees: ['design@example.com', 'eng@example.com'],
    },
    {
      id: 'event-3',
      title: 'Customer Follow-Up',
      startsAtIso: new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString(),
      endsAtIso: new Date(now.getTime() + 27 * 60 * 60 * 1000).toISOString(),
      location: 'Google Meet',
      notes: 'Discuss onboarding friction findings.',
      attendees: ['success@example.com'],
    },
  ];
};

const toResult = (summary: string, data: Record<string, unknown>): ConnectorActionResult => ({
  ok: true,
  summary,
  data,
});

const eventMatchesRange = (
  event: MockCalendarEvent,
  startIso?: string,
  endIso?: string
): boolean => {
  const startMs = startIso ? Date.parse(startIso) : Number.NEGATIVE_INFINITY;
  const endMs = endIso ? Date.parse(endIso) : Number.POSITIVE_INFINITY;
  const eventStartMs = Date.parse(event.startsAtIso);
  const eventEndMs = Date.parse(event.endsAtIso);

  return eventEndMs >= startMs && eventStartMs <= endMs;
};

export const createCalendarConnector = (
  seedEvents: ReadonlyArray<MockCalendarEvent> = defaultEvents()
): Connector => {
  const events = [...seedEvents];

  return {
    manifest: {
      id: 'calendar',
      name: 'Calendar (Google/CalDAV)',
      version: '1.0.0',
      runtimeMode: 'mock',
      auth: {
        type: 'oauth',
        setupLabel: 'Connect Calendar account',
      },
      actions: [
        {
          id: 'list_events',
          title: 'List events',
          description: 'List upcoming events in date range.',
          mutation: false,
          idempotent: true,
        },
        {
          id: 'search_events',
          title: 'Search events',
          description: 'Search calendar events by title/location/notes.',
          mutation: false,
          idempotent: true,
        },
        {
          id: 'create_event',
          title: 'Create event',
          description: 'Create a new calendar event.',
          mutation: true,
          idempotent: false,
          policyActionId: 'connector.permission.grant',
        },
        {
          id: 'update_event',
          title: 'Update event',
          description: 'Update an existing calendar event.',
          mutation: true,
          idempotent: false,
          policyActionId: 'connector.permission.grant',
        },
      ],
    },
    async execute(actionId, context) {
      if (actionId === 'list_events') {
        const limit = Number(context.payload.limit ?? 10);
        const startIso = typeof context.payload.startIso === 'string' ? context.payload.startIso : undefined;
        const endIso = typeof context.payload.endIso === 'string' ? context.payload.endIso : undefined;

        const filtered = events.filter((event) => eventMatchesRange(event, startIso, endIso));

        return toResult(`Loaded ${filtered.length} event(s).`, {
          events: filtered.slice(0, Math.max(1, Math.min(limit, 50))),
        });
      }

      if (actionId === 'search_events') {
        const query = String(context.payload.query ?? '').trim().toLowerCase();
        const matches = query
          ? events.filter((event) =>
              [event.title, event.location ?? '', event.notes ?? '']
                .join(' ')
                .toLowerCase()
                .includes(query)
            )
          : events;

        return toResult(`Found ${matches.length} matching event(s).`, {
          events: matches,
        });
      }

      if (actionId === 'create_event') {
        const title = String(context.payload.title ?? '').trim();
        const startsAtIso = String(context.payload.startsAtIso ?? '').trim();
        const endsAtIso = String(context.payload.endsAtIso ?? '').trim();

        if (!title || !startsAtIso || !endsAtIso) {
          return {
            ok: false,
            summary: 'Cannot create event.',
            errorMessage: 'title, startsAtIso, and endsAtIso are required.',
          };
        }

        const created: MockCalendarEvent = {
          id: makeId('event'),
          title,
          startsAtIso,
          endsAtIso,
          location: typeof context.payload.location === 'string' ? context.payload.location : undefined,
          notes: typeof context.payload.notes === 'string' ? context.payload.notes : undefined,
          attendees: Array.isArray(context.payload.attendees)
            ? context.payload.attendees.map((entry) => String(entry))
            : undefined,
        };

        events.unshift(created);
        return toResult(`Created event ${created.id}.`, { event: created });
      }

      if (actionId === 'update_event') {
        const eventId = String(context.payload.eventId ?? '').trim();
        if (!eventId) {
          return {
            ok: false,
            summary: 'Cannot update event.',
            errorMessage: 'eventId is required.',
          };
        }

        const index = events.findIndex((event) => event.id === eventId);
        if (index === -1) {
          return {
            ok: false,
            summary: 'Event not found.',
            errorMessage: `No event for id=${eventId}`,
          };
        }

        const current = events[index];
        const updated: MockCalendarEvent = {
          ...current,
          title:
            typeof context.payload.title === 'string' && context.payload.title.trim().length > 0
              ? context.payload.title
              : current.title,
          startsAtIso:
            typeof context.payload.startsAtIso === 'string' && context.payload.startsAtIso.trim().length > 0
              ? context.payload.startsAtIso
              : current.startsAtIso,
          endsAtIso:
            typeof context.payload.endsAtIso === 'string' && context.payload.endsAtIso.trim().length > 0
              ? context.payload.endsAtIso
              : current.endsAtIso,
          location:
            typeof context.payload.location === 'string' ? context.payload.location : current.location,
          notes: typeof context.payload.notes === 'string' ? context.payload.notes : current.notes,
          attendees: Array.isArray(context.payload.attendees)
            ? context.payload.attendees.map((entry) => String(entry))
            : current.attendees,
        };

        events[index] = updated;
        return toResult(`Updated event ${updated.id}.`, { event: updated });
      }

      return {
        ok: false,
        summary: 'Unsupported calendar connector action.',
        errorMessage: `Unknown action "${actionId}"`,
      };
    },
    async validateAuth(context) {
      const token = context.authToken?.trim() ?? '';
      if (token.length < 12 || !/^calendar_[a-z0-9_-]+$/i.test(token)) {
        return {
          valid: false,
          message: 'Invalid calendar token format. Expected token prefix "calendar_".',
        };
      }
      return {
        valid: true,
        message: 'Calendar token accepted by connector health check.',
      };
    },
  };
};
