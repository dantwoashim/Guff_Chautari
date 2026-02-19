import React, { useMemo, useState } from 'react';
import {
  generateWeeklyBriefing,
  listActivityEvents,
  summarizeWeeklyActivity,
  type ActivityCategory,
  type ActivityEvent,
  type WeeklyBriefing,
} from '../../activity';

interface ActivityTimelinePanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const CATEGORY_LABELS: Array<{ value: ActivityCategory; label: string; color: string }> = [
  { value: 'chat', label: 'Chat', color: 'bg-[#1c3b2d] text-[#9de5ba]' },
  { value: 'knowledge', label: 'Knowledge', color: 'bg-[#1f3246] text-[#b6dbff]' },
  { value: 'decision', label: 'Decision', color: 'bg-[#3f2d1f] text-[#ffd7a8]' },
  { value: 'workflow', label: 'Workflow', color: 'bg-[#2a2146] text-[#d6c7ff]' },
  { value: 'reflection', label: 'Reflection', color: 'bg-[#143a3b] text-[#9ce6e8]' },
  { value: 'plugin', label: 'Plugin', color: 'bg-[#3d1f3a] text-[#f3b9ee]' },
];

const toDateKey = (iso: string): string => {
  const date = new Date(iso);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const dateLabel = (iso: string): string => {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const groupByDate = (events: ReadonlyArray<ActivityEvent>): Array<{ dateKey: string; events: ActivityEvent[] }> => {
  const groups = new Map<string, ActivityEvent[]>();

  for (const event of events) {
    const key = toDateKey(event.createdAtIso);
    const existing = groups.get(key) ?? [];
    groups.set(key, [...existing, event]);
  }

  return Array.from(groups.entries())
    .sort((left, right) => Date.parse(right[0]) - Date.parse(left[0]))
    .map(([dateKey, dayEvents]) => ({
      dateKey,
      events: dayEvents.sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso)),
    }));
};

const ActivityBadge = ({ category }: { category: ActivityCategory }) => {
  const descriptor = CATEGORY_LABELS.find((entry) => entry.value === category);
  if (!descriptor) return null;
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[11px] ${descriptor.color}`}>{descriptor.label}</span>
  );
};

export const ActivityTimelinePanel: React.FC<ActivityTimelinePanelProps> = ({ userId }) => {
  const [selectedCategories, setSelectedCategories] = useState<ActivityCategory[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadLimit, setLoadLimit] = useState(40);
  const [briefing, setBriefing] = useState<WeeklyBriefing | null>(null);

  const summary = useMemo(() => summarizeWeeklyActivity({ userId }), [userId]);

  const events = useMemo(() => {
    return listActivityEvents({
      userId,
      filter: {
        categories: selectedCategories,
        searchTerm,
      },
      limit: 500,
    });
  }, [searchTerm, selectedCategories, userId]);

  const visibleEvents = useMemo(() => events.slice(0, loadLimit), [events, loadLimit]);
  const grouped = useMemo(() => groupByDate(visibleEvents), [visibleEvents]);

  const toggleCategory = (value: ActivityCategory) => {
    setSelectedCategories((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]
    );
    setLoadLimit(40);
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Unified Activity Timeline</h2>
            <p className="text-sm text-[#8696a0]">
              Chat, knowledge, decisions, workflows, reflection, and plugin activity in one chronological feed.
            </p>
          </div>
          <div className="text-xs text-[#8696a0]">{events.length} matched event(s)</div>
        </div>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Weekly Summary</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
              <div className="text-[11px] uppercase text-[#7f929c]">Week Range</div>
              <div className="mt-1 text-xs text-[#d6e1e6]">
                {new Date(summary.weekStartIso).toLocaleDateString()} - {new Date(summary.weekEndIso).toLocaleDateString()}
              </div>
            </div>
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
              <div className="text-[11px] uppercase text-[#7f929c]">Total Events</div>
              <div className="mt-1 text-lg font-semibold text-[#d6e1e6]">{summary.totalEvents}</div>
            </div>
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
              <div className="text-[11px] uppercase text-[#7f929c]">Top Event Type</div>
              <div className="mt-1 text-xs text-[#d6e1e6]">{summary.topEventTypes[0]?.eventType ?? 'n/a'}</div>
            </div>
          </div>

          <div className="mt-3 text-xs text-[#9fb0ba]">
            This week: {summary.countsByCategory.chat} chat, {summary.countsByCategory.knowledge} knowledge,{' '}
            {summary.countsByCategory.decision} decisions, {summary.countsByCategory.workflow} workflows,{' '}
            {summary.countsByCategory.reflection} reflections, {summary.countsByCategory.plugin} plugin actions.
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {CATEGORY_LABELS.map((entry) => {
              const active = selectedCategories.includes(entry.value);
              return (
                <button
                  key={entry.value}
                  type="button"
                  className={`rounded border px-2 py-1 text-xs ${
                    active
                      ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                      : 'border-[#313d45] bg-[#0f171c] text-[#9fb0ba] hover:border-[#4a5961]'
                  }`}
                  onClick={() => toggleCategory(entry.value)}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setLoadLimit(40);
              }}
              placeholder="Search events"
              className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#dfe7eb]"
            />
            <button
              type="button"
              className="rounded border border-[#4d6a7c] px-3 py-2 text-xs text-[#bed7e7] hover:bg-[#1b2d38]"
              onClick={() => setBriefing(generateWeeklyBriefing({ userId }))}
            >
              Generate Briefing
            </button>
          </div>

          {briefing ? (
            <div className="mt-3 rounded border border-[#2a3a44] bg-[#0f171c] p-3">
              <div className="text-sm text-[#e9edef]">{briefing.title}</div>
              <div className="mt-1 whitespace-pre-wrap text-xs text-[#9fb0ba]">{briefing.summary}</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#c5d4db]">
                {briefing.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="mt-2 text-xs text-[#8ea1ab]">Follow-ups:</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-[#9fb0ba]">
                {briefing.followUps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Activity Feed</h3>
          {grouped.length === 0 ? (
            <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              No events yet. Perform actions in chat, knowledge, decisions, workflows, or reflection panels.
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map((group) => (
                <div key={group.dateKey}>
                  <div className="mb-2 text-[11px] uppercase text-[#7f929c]">{dateLabel(group.dateKey)}</div>
                  <div className="space-y-2">
                    {group.events.map((event) => (
                      <div
                        key={event.id}
                        className="rounded border border-[#27343d] bg-[#0f171c] px-3 py-2 text-xs text-[#c3d2d9]"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <ActivityBadge category={event.category} />
                            <span className="text-[#e9edef]">{event.title}</span>
                          </div>
                          <span className="text-[11px] text-[#7f929c]">
                            {new Date(event.createdAtIso).toLocaleTimeString()}
                          </span>
                        </div>
                        <div>{event.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {events.length > visibleEvents.length ? (
                <button
                  type="button"
                  className="w-full rounded border border-[#4d6a7c] px-3 py-2 text-xs text-[#bed7e7] hover:bg-[#1b2d38]"
                  onClick={() => setLoadLimit((current) => current + 40)}
                >
                  Load more
                </button>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ActivityTimelinePanel;
