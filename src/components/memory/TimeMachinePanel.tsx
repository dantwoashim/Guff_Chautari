import React, { useMemo, useState } from 'react';
import type { Message } from '../../../types';
import { buildEmotionalTrend } from '../../analytics';
import { listActivityEvents } from '../../activity';
import {
  TIMELINE_LANES,
  answerTemporalQuery,
  buildTemporalMemoryIndex,
  detectBeliefChanges,
  renderTimeline,
  trackGoalEvolution,
  type TimelineEvent,
  type TimelineGranularity,
  type TimelineLane,
} from '../../memory/timeMachine';

interface TimeMachinePanelProps {
  userId: string;
  messages?: ReadonlyArray<Message>;
  onOpenCounterfactual?: (query: string) => void;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const laneLabel: Record<TimelineLane, string> = {
  beliefs: 'Beliefs',
  goals: 'Goals',
  emotion: 'Emotion',
  knowledge: 'Knowledge',
  decisions: 'Decisions',
};

const formatDateTime = (iso: string): string => {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const sampleFallbackIndex = (userId: string) =>
  buildTemporalMemoryIndex({
    userId,
    snapshots: [
      {
        id: 'sample-belief',
        userId,
        occurredAtIso: '2026-08-01T09:00:00.000Z',
        lane: 'beliefs',
        topic: 'product strategy',
        summary: 'Shifted from broad launch to focused iteration loops.',
        sourceType: 'manual',
        sourceId: 'sample-1',
      },
      {
        id: 'sample-goal',
        userId,
        occurredAtIso: '2026-08-02T09:00:00.000Z',
        lane: 'goals',
        topic: 'retention milestone',
        summary: 'Activated retention-focused weekly goal arc.',
        sourceType: 'manual',
        sourceId: 'sample-2',
      },
      {
        id: 'sample-emotion',
        userId,
        occurredAtIso: '2026-08-03T09:00:00.000Z',
        lane: 'emotion',
        topic: 'emotional baseline',
        summary: 'Calmer execution week with lower volatility.',
        sourceType: 'analytics',
        sourceId: 'sample-3',
        emotionalValence: 0.64,
        metadata: { arousal: 0.39, message_count: 8 },
      },
      {
        id: 'sample-knowledge',
        userId,
        occurredAtIso: '2026-08-04T09:00:00.000Z',
        lane: 'knowledge',
        topic: 'onboarding bottlenecks',
        summary: 'Learned top friction points from onboarding interviews.',
        sourceType: 'manual',
        sourceId: 'sample-4',
      },
    ],
    nowIso: '2026-08-05T09:00:00.000Z',
  });

export const TimeMachinePanel: React.FC<TimeMachinePanelProps> = ({ userId, messages = [], onOpenCounterfactual }) => {
  const [granularity, setGranularity] = useState<TimelineGranularity>('week');
  const [selectedLanes, setSelectedLanes] = useState<TimelineLane[]>([...TIMELINE_LANES]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [timeQuery, setTimeQuery] = useState('');
  const [queryAnswer, setQueryAnswer] = useState<ReturnType<typeof answerTemporalQuery> | null>(null);

  const activityEvents = useMemo(
    () =>
      listActivityEvents({
        userId,
        limit: 1500,
      }),
    [userId]
  );

  const emotionalTrend = useMemo(
    () =>
      buildEmotionalTrend({
        personaId: 'time-machine',
        messages,
        windowDays: 90,
      }),
    [messages]
  );

  const beliefChanges = useMemo(
    () =>
      detectBeliefChanges({
        userId,
        messages: messages.map((message) => ({
          id: message.id,
          text: message.text,
          timestamp: message.timestamp,
        })),
        decisions: activityEvents
          .filter((event) => event.category === 'decision')
          .map((event) => ({
            id: event.id,
            question: event.title,
            createdAtIso: event.createdAtIso,
            rationale: event.description,
            selectedOptionTitle:
              typeof event.metadata?.selected_option_id === 'string'
                ? event.metadata.selected_option_id
                : undefined,
          })),
      }),
    [activityEvents, messages, userId]
  );

  const goalEvolutions = useMemo(
    () =>
      trackGoalEvolution({
        userId,
        activityEvents: activityEvents.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          title: event.title,
          description: event.description,
          createdAtIso: event.createdAtIso,
          metadata: event.metadata,
        })),
      }),
    [activityEvents, userId]
  );

  const index = useMemo(() => {
    const built = buildTemporalMemoryIndex({
      userId,
      messages: messages.map((message) => ({
        id: message.id,
        text: message.text,
        timestamp: message.timestamp,
      })),
      activityEvents: activityEvents.map((event) => ({
        id: event.id,
        category: event.category,
        eventType: event.eventType,
        title: event.title,
        description: event.description,
        createdAtIso: event.createdAtIso,
        threadId: event.threadId,
        metadata: event.metadata,
      })),
      emotionalTrend: emotionalTrend.points.map((point) => ({
        dateIso: point.dateIso,
        valence: point.valence,
        arousal: point.arousal,
        messageCount: point.messageCount,
      })),
      beliefChanges,
      goalEvolutions,
    });

    if (built.events.length === 0) {
      return sampleFallbackIndex(userId);
    }

    return built;
  }, [activityEvents, beliefChanges, emotionalTrend.points, goalEvolutions, messages, userId]);

  const rendered = useMemo(
    () =>
      renderTimeline({
        index,
        granularity,
        lanes: selectedLanes,
        searchTerm,
      }),
    [granularity, index, searchTerm, selectedLanes]
  );

  const selectedEvent: TimelineEvent | null = useMemo(() => {
    if (!selectedEventId) return rendered.events[0] ?? null;
    return rendered.events.find((event) => event.id === selectedEventId) ?? rendered.events[0] ?? null;
  }, [rendered.events, selectedEventId]);

  const toggleLane = (lane: TimelineLane) => {
    setSelectedLanes((current) => {
      if (current.includes(lane)) {
        const next = current.filter((entry) => entry !== lane);
        return next.length > 0 ? next : current;
      }
      return [...current, lane];
    });
  };

  const runTimeQuery = () => {
    const answer = answerTemporalQuery({
      query: timeQuery,
      index,
      maxMatches: 5,
    });
    setQueryAnswer(answer);
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className={panelClass}>
          <h2 className="text-lg font-semibold text-[#e9edef]">Memory Time Machine</h2>
          <p className="mt-1 text-sm text-[#8ea1ab]">
            Inspect belief, goal, emotional, knowledge, and decision shifts over time with drill-down context.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-[auto_auto_1fr]">
            <label className="text-xs text-[#8ea1ab]">
              Zoom
              <select
                value={granularity}
                onChange={(event) => setGranularity(event.target.value as TimelineGranularity)}
                className="mt-1 w-full rounded border border-[#313d45] bg-[#0f171c] px-2 py-2 text-xs text-[#d8e1e6]"
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="quarter">Quarter</option>
              </select>
            </label>
            <label className="text-xs text-[#8ea1ab]">
              Search
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Filter timeline"
                className="mt-1 w-full rounded border border-[#313d45] bg-[#0f171c] px-2 py-2 text-xs text-[#d8e1e6]"
              />
            </label>
            <div>
              <div className="mb-1 text-xs text-[#8ea1ab]">Lanes</div>
              <div className="flex flex-wrap gap-2">
                {TIMELINE_LANES.map((lane) => {
                  const active = selectedLanes.includes(lane);
                  return (
                    <button
                      key={lane}
                      type="button"
                      onClick={() => toggleLane(lane)}
                      className={`rounded border px-2 py-1 text-xs ${
                        active
                          ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                          : 'border-[#313d45] bg-[#0f171c] text-[#9fb0ba]'
                      }`}
                    >
                      {laneLabel[lane]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </header>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Time Query</h3>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              value={timeQuery}
              onChange={(event) => setTimeQuery(event.target.value)}
              placeholder="When did I start caring about user retention?"
              className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#d8e1e6]"
            />
            <button
              type="button"
              className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
              onClick={runTimeQuery}
              disabled={timeQuery.trim().length === 0}
            >
              Ask
            </button>
          </div>
          {queryAnswer ? (
            <div className="mt-3 rounded border border-[#2d3942] bg-[#0d151a] p-3 text-xs text-[#bcd0da]">
              <div className="text-[#e9edef]">{queryAnswer.answer}</div>
              {queryAnswer.matches.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {queryAnswer.matches.map((match) => (
                    <div key={match.eventId} className="text-[#8ea1ab]">
                      {formatDateTime(match.occurredAtIso)} - {match.title}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <section className={panelClass}>
            <div className="mb-2 flex items-center justify-between text-xs text-[#8ea1ab]">
              <span>{rendered.events.length} event(s)</span>
              <span>{rendered.buckets.length} {granularity} bucket(s)</span>
            </div>

            {rendered.lanes.every((lane) => lane.events.length === 0) ? (
              <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-xs text-[#8ea1ab]">
                No events match current filters.
              </div>
            ) : (
              <div className="space-y-3">
                {rendered.lanes.map((lane) =>
                  lane.events.length === 0 ? null : (
                    <div key={lane.lane}>
                      <div className="mb-1 text-xs uppercase tracking-wide text-[#7c919b]">{lane.label}</div>
                      <div className="space-y-2">
                        {lane.events.map((event) => {
                          const selected = selectedEvent?.id === event.id;
                          return (
                            <button
                              key={event.id}
                              type="button"
                              className={`w-full rounded border p-3 text-left text-xs ${
                                selected
                                  ? 'border-[#00a884] bg-[#173b38] text-[#eafff9]'
                                  : 'border-[#2d3942] bg-[#0f171c] text-[#c2d2d9]'
                              }`}
                              onClick={() => setSelectedEventId(event.id)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[#e9edef]">{event.title}</span>
                                <span className="text-[11px] text-[#8ea1ab]">{formatDateTime(event.occurredAtIso)}</span>
                              </div>
                              <div className="mt-1 text-[#9fb0ba]">{event.summary}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Drill-down: Why did this change?</h3>
            {selectedEvent ? (
              <div className="space-y-2 text-xs text-[#c4d3da]">
                <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3">
                  <div className="text-[#e9edef]">{selectedEvent.title}</div>
                  <div className="mt-1 text-[#9fb0ba]">{selectedEvent.summary}</div>
                  <div className="mt-2 text-[11px] text-[#7f939d]">
                    {formatDateTime(selectedEvent.occurredAtIso)} • lane {laneLabel[selectedEvent.lane]}
                  </div>
                </div>

                <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-[#9fb0ba]">
                  <div className="text-[#e9edef]">Reason</div>
                  <div className="mt-1">{selectedEvent.why}</div>
                  <div className="mt-2 text-[11px] text-[#7f939d]">
                    Source refs: {selectedEvent.drillDownRefIds.join(', ')}
                  </div>
                </div>

                {selectedEvent.lane === 'beliefs' ? (
                  <button
                    type="button"
                    className="w-full rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                    onClick={() =>
                      onOpenCounterfactual?.(`What if this belief had not changed about ${selectedEvent.topic}?`)
                    }
                  >
                    Fork View: What if this belief had not changed?
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-xs text-[#8ea1ab]">
                Select an event to inspect full context.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default TimeMachinePanel;
