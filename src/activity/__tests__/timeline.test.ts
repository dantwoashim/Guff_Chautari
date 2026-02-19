import { describe, expect, it } from 'vitest';
import { emitActivityEvent, listActivityEvents } from '../eventEmitter';
import { ActivityStore, createInMemoryActivityStoreAdapter } from '../store';
import { generateWeeklyBriefing } from '../briefingGenerator';
import { groupActivityTimeline, summarizeWeeklyActivity } from '../timeline';

const buildStore = () => new ActivityStore(createInMemoryActivityStoreAdapter());

describe('activity timeline', () => {
  it('records and filters blended activity events', () => {
    const store = buildStore();
    const userId = 'user-activity';

    emitActivityEvent(
      {
        userId,
        category: 'chat',
        eventType: 'message.sent',
        title: 'Message sent',
        description: 'User sent a new message.',
        createdAtIso: '2026-10-05T10:00:00.000Z',
      },
      store
    );

    emitActivityEvent(
      {
        userId,
        category: 'knowledge',
        eventType: 'knowledge.ingested',
        title: 'Knowledge added',
        description: 'Ingested one URL source.',
        createdAtIso: '2026-10-05T11:00:00.000Z',
      },
      store
    );

    emitActivityEvent(
      {
        userId,
        category: 'workflow',
        eventType: 'workflow.completed',
        title: 'Workflow completed',
        description: 'Daily digest workflow completed.',
        createdAtIso: '2026-10-06T09:00:00.000Z',
      },
      store
    );

    const filtered = listActivityEvents(
      {
        userId,
        filter: {
          categories: ['knowledge', 'workflow'],
        },
      },
      store
    );

    expect(filtered).toHaveLength(2);
    expect(filtered[0].category).toBe('workflow');

    const grouped = groupActivityTimeline({ userId, limit: 10 }, store);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].events[0].title).toBe('Workflow completed');
  });

  it('summarizes week activity and generates briefing', () => {
    const store = buildStore();
    const userId = 'user-brief';

    emitActivityEvent(
      {
        userId,
        category: 'decision',
        eventType: 'decision.completed',
        title: 'Decision completed',
        description: 'Selected focused launch option.',
        createdAtIso: '2026-10-06T09:00:00.000Z',
      },
      store
    );

    emitActivityEvent(
      {
        userId,
        category: 'workflow',
        eventType: 'workflow.completed',
        title: 'Workflow completed',
        description: 'Morning email summary finished.',
        createdAtIso: '2026-10-07T07:00:00.000Z',
      },
      store
    );

    emitActivityEvent(
      {
        userId,
        category: 'workflow',
        eventType: 'workflow.completed',
        title: 'Workflow completed',
        description: 'Second workflow finished.',
        createdAtIso: '2026-10-08T07:00:00.000Z',
      },
      store
    );

    const summary = summarizeWeeklyActivity(
      {
        userId,
        nowIso: '2026-10-09T10:00:00.000Z',
      },
      store
    );

    expect(summary.totalEvents).toBe(3);
    expect(summary.countsByCategory.workflow).toBe(2);
    expect(summary.topEventTypes[0].eventType).toBe('workflow.completed');

    const briefing = generateWeeklyBriefing(
      {
        userId,
        nowIso: '2026-10-09T10:00:00.000Z',
      },
      store
    );

    expect(briefing.summary).toContain('You logged 3 events');
    expect(briefing.highlights.length).toBeGreaterThan(1);
    expect(
      briefing.highlights.some((highlight) => highlight.includes('Workflow execution summary'))
    ).toBe(true);
  });
});
