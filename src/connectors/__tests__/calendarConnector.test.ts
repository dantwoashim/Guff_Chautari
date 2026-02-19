import { describe, expect, it } from 'vitest';
import { createCalendarConnector } from '../calendar/calendarConnector';

describe('calendarConnector', () => {
  it('lists events and supports create/update flows', async () => {
    const connector = createCalendarConnector();

    const listResult = await connector.execute('list_events', {
      userId: 'calendar-user',
      payload: { limit: 10 },
    });

    expect(listResult.ok).toBe(true);
    const events = listResult.data?.events as Array<{ id: string; startsAtIso: string; endsAtIso: string }>;
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        startsAtIso: expect.any(String),
        endsAtIso: expect.any(String),
      })
    );

    const createResult = await connector.execute('create_event', {
      userId: 'calendar-user',
      payload: {
        title: 'Board review',
        startsAtIso: '2026-02-20T10:00:00.000Z',
        endsAtIso: '2026-02-20T11:00:00.000Z',
        location: 'Room 9',
      },
    });

    expect(createResult.ok).toBe(true);
    const createdId = String((createResult.data?.event as { id: string }).id);

    const updateResult = await connector.execute('update_event', {
      userId: 'calendar-user',
      payload: {
        eventId: createdId,
        notes: 'Bring KPI snapshot and risk notes.',
      },
    });

    expect(updateResult.ok).toBe(true);
    expect(updateResult.data?.event).toEqual(
      expect.objectContaining({
        id: createdId,
        notes: 'Bring KPI snapshot and risk notes.',
      })
    );
  });
});
