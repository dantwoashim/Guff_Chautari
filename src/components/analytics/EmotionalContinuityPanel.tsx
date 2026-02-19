import React, { useMemo } from 'react';
import type { Message } from '../../../types';
import { buildEmotionalTrend, buildRelationshipTimeline, detectEmotionalPatterns } from '../../analytics';
import { runFollowThroughTracker, summarizeFollowThroughDashboard } from '../../counterfactual';

interface EmotionalContinuityPanelProps {
  userId?: string;
  personaId: string;
  messages: ReadonlyArray<Message>;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const scoreToPercent = (value: number): string => `${Math.round(value * 100)}%`;

const TrendBar = ({ value, color }: { value: number; color: string }) => {
  return (
    <div className="h-2 rounded bg-[#202c33]">
      <div className={`h-2 rounded ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
};

export const EmotionalContinuityPanel: React.FC<EmotionalContinuityPanelProps> = ({ userId, personaId, messages }) => {
  const trend = useMemo(
    () =>
      buildEmotionalTrend({
        personaId,
        messages,
        windowDays: 30,
      }),
    [messages, personaId]
  );

  const insights = useMemo(() => detectEmotionalPatterns(trend), [trend]);

  const relationshipTimeline = useMemo(
    () =>
      buildRelationshipTimeline({
        personaId,
        messages,
      }),
    [messages, personaId]
  );

  const followThrough = useMemo(
    () => {
      if (!userId) return null;
      runFollowThroughTracker({ userId });
      return summarizeFollowThroughDashboard({
        userId,
      });
    },
    [userId]
  );

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Emotional Continuity Dashboard</h2>
            <p className="text-sm text-[#8696a0]">
              30-day emotional trend, temporal pattern insights, and relationship-stage timeline.
            </p>
          </div>
          <div className="text-xs text-[#8696a0]">{trend.points.length} day(s) with signal</div>
        </div>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Emotional Trend</h3>
          {trend.points.length === 0 ? (
            <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              Need more recent messages to compute a 30-day trend.
            </div>
          ) : (
            <div className="space-y-2">
              {trend.points.map((point) => (
                <div key={point.dateIso} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[#e9edef]">{point.dayLabel}</span>
                    <span className="text-[#8ea1ab]">{point.messageCount} msg</span>
                  </div>
                  <div className="space-y-1">
                    <div>
                      <div className="mb-1 text-[11px] text-[#8ea1ab]">Valence {scoreToPercent(point.valence)}</div>
                      <TrendBar value={point.valence} color="bg-[#00a884]" />
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] text-[#8ea1ab]">Arousal {scoreToPercent(point.arousal)}</div>
                      <TrendBar value={point.arousal} color="bg-[#4f8fc7]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Pattern Insights</h3>
          <div className="space-y-2">
            {insights.map((insight) => (
              <div key={insight.id} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#e9edef]">{insight.label}</span>
                  <span className="text-[#8ea1ab]">
                    {Math.round(insight.confidence * 100)}% • {insight.severity}
                  </span>
                </div>
                <div className="mt-1 text-[#9fb0ba]">{insight.description}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Relationship Timeline</h3>
          <div className="space-y-2">
            {relationshipTimeline.entries.map((entry) => (
              <div key={`${entry.timestampIso}-${entry.stage}`} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#e9edef]">Stage: {entry.stage}</span>
                  <span className="text-[#8ea1ab]">
                    Trust {Math.round(entry.trustScore * 100)}% • {new Date(entry.timestampIso).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-1 text-[#9fb0ba]">{entry.reason}</div>
              </div>
            ))}
          </div>
        </section>

        {followThrough ? (
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Decision Follow-through Status</h3>
            <div className="grid gap-2 text-xs sm:grid-cols-4">
              <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
                <div className="text-[#8ea1ab]">Tracked</div>
                <div className="text-[#e9edef]">{followThrough.totalDecisions}</div>
              </div>
              <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
                <div className="text-[#8ea1ab]">On track</div>
                <div className="text-[#bde8c8]">{followThrough.onTrack}</div>
              </div>
              <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
                <div className="text-[#8ea1ab]">At risk</div>
                <div className="text-[#f5d9a7]">{followThrough.atRisk}</div>
              </div>
              <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
                <div className="text-[#8ea1ab]">Missed</div>
                <div className="text-[#f0c2c2]">{followThrough.missed}</div>
              </div>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              {followThrough.nudges.length === 0 ? (
                <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-[#8ea1ab]">
                  No follow-through nudges.
                </div>
              ) : (
                followThrough.nudges.slice(0, 4).map((nudge) => (
                  <div key={nudge.id} className="rounded border border-[#27343d] bg-[#0f171c] p-3">
                    <div className="text-[#e9edef]">{nudge.title}</div>
                    <div className="mt-1 text-[#9fb0ba]">{nudge.message}</div>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};

export default EmotionalContinuityPanel;
