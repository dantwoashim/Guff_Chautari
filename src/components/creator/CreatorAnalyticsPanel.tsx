import React, { useMemo, useState } from 'react';
import {
  buildCreatorAnalytics,
  buildCreatorInterviewTemplate,
  getWeeklyFeaturedCreatorSpotlight,
  listFeaturedCreatorSpotlights,
} from '../../creator';

interface CreatorAnalyticsPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const pct = (value: number): string => `${Math.round(value * 100)}%`;

const MetricBar = ({ value, max, colorClass }: { value: number; max: number; colorClass: string }) => {
  const width = max <= 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="h-2 rounded bg-[#202c33]">
      <div className={`h-2 rounded ${colorClass}`} style={{ width: `${Math.min(100, width)}%` }} />
    </div>
  );
};

export const CreatorAnalyticsPanel: React.FC<CreatorAnalyticsPanelProps> = ({ userId }) => {
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = () => setRefreshTick((tick) => tick + 1);

  const snapshot = useMemo(() => {
    void refreshTick;
    return buildCreatorAnalytics({
      userId,
    });
  }, [refreshTick, userId]);

  const spotlightLeaderboard = useMemo(() => {
    void refreshTick;
    return listFeaturedCreatorSpotlights({
      userId,
      limit: 6,
    });
  }, [refreshTick, userId]);

  const weeklySpotlight = useMemo(() => {
    void refreshTick;
    return getWeeklyFeaturedCreatorSpotlight({
      userId,
      candidateLimit: 8,
    });
  }, [refreshTick, userId]);

  const showcaseTemplate = useMemo(() => {
    if (!weeklySpotlight.featured) return null;
    return buildCreatorInterviewTemplate({
      spotlight: weeklySpotlight.featured,
      weekStartIso: weeklySpotlight.weekStartIso,
    });
  }, [weeklySpotlight]);

  const maxRatingVotes = Math.max(...snapshot.ratingsDistribution.map((bucket) => bucket.votes), 1);
  const maxTemplateInstalls = Math.max(...snapshot.templates.map((template) => template.installs), 1);

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Creator Analytics Dashboard</h2>
            <p className="text-sm text-[#8696a0]">
              Installs, active-user signal, rating distribution, revenue readiness, and weekly creator spotlight.
            </p>
          </div>
          <button
            type="button"
            className="rounded border border-[#31596b] px-3 py-1.5 text-xs text-[#b8dbeb] hover:bg-[#183544]"
            onClick={refresh}
          >
            Refresh Metrics
          </button>
        </div>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Topline Metrics</h3>
          <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
              <div className="text-[#8ea1ab]">Templates</div>
              <div className="text-[#e9edef]">{snapshot.templateCount}</div>
            </div>
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
              <div className="text-[#8ea1ab]">Total installs</div>
              <div className="text-[#e9edef]">{snapshot.totalInstalls}</div>
            </div>
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
              <div className="text-[#8ea1ab]">Active users (30d)</div>
              <div className="text-[#e9edef]">{snapshot.activeUsers}</div>
            </div>
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
              <div className="text-[#8ea1ab]">Avg rating</div>
              <div className="text-[#e9edef]">
                {snapshot.averageRating.toFixed(2)} ({snapshot.totalRatingVotes} votes)
              </div>
            </div>
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
              <div className="text-[#8ea1ab]">Revenue readiness</div>
              <div className="text-[#bde8c8]">{pct(snapshot.revenueReadinessScore)}</div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Rating Distribution</h3>
            {snapshot.totalRatingVotes === 0 ? (
              <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                No ratings yet. Ratings distribution appears after users submit reviews.
              </div>
            ) : (
              <div className="space-y-2">
                {snapshot.ratingsDistribution
                  .slice()
                  .reverse()
                  .map((bucket) => (
                    <div key={bucket.rating} className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[#e9edef]">{bucket.rating}-star</span>
                        <span className="text-[#8ea1ab]">
                          {bucket.votes} votes • {pct(bucket.share)}
                        </span>
                      </div>
                      <MetricBar value={bucket.votes} max={maxRatingVotes} colorClass="bg-[#4f8fc7]" />
                    </div>
                  ))}
              </div>
            )}
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Weekly Featured Creator</h3>
            {weeklySpotlight.featured ? (
              <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                <div className="text-sm text-[#e9edef]">{weeklySpotlight.featured.creatorUserId}</div>
                <div className="mt-1 text-[#8ea1ab]">
                  Week start {new Date(weeklySpotlight.weekStartIso).toLocaleDateString()}
                </div>
                <div className="mt-2 text-[#9fb0ba]">
                  Spotlight score {(weeklySpotlight.featured.score * 100).toFixed(2)} • installs{' '}
                  {weeklySpotlight.featured.installs} • rating {weeklySpotlight.featured.averageRating.toFixed(2)}
                </div>
              </div>
            ) : (
              <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                No eligible creators yet. Approve templates and gather installs to generate spotlight rotation.
              </div>
            )}

            <div className="mt-3 space-y-2">
              {spotlightLeaderboard.length === 0 ? (
                <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                  Leaderboard is empty.
                </div>
              ) : (
                spotlightLeaderboard.map((entry) => (
                  <div key={entry.creatorUserId} className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#e9edef]">
                        #{entry.rank} {entry.creatorUserId}
                      </span>
                      <span className="text-[#7bd0b6]">{(entry.score * 100).toFixed(2)}</span>
                    </div>
                    <div className="mt-1 text-[#8ea1ab]">
                      installs {entry.installs} • rating {entry.averageRating.toFixed(2)} • benchmark{' '}
                      {pct(entry.benchmarkComplianceRate)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Template Performance</h3>
          {snapshot.templates.length === 0 ? (
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              No approved templates found for this creator.
            </div>
          ) : (
            <div className="space-y-2">
              {snapshot.templates.map((template) => (
                <div key={template.templateId} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[#e9edef]">{template.templateName}</span>
                    <span className="text-[#8ea1ab]">{template.templateId}</span>
                  </div>
                  <div className="text-[#9fb0ba]">
                    installs {template.installs} • active users {template.activeUsers} • rating{' '}
                    {template.ratingAverage.toFixed(2)} ({template.ratingVotes} votes) • benchmark{' '}
                    {template.benchmarkCompliant ? 'compliant' : 'missing'}
                  </div>
                  <div className="mt-2">
                    <MetricBar value={template.installs} max={maxTemplateInstalls} colorClass="bg-[#00a884]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {showcaseTemplate ? (
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Creator Interview Template</h3>
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
              <div className="text-[#e9edef]">{showcaseTemplate.headline}</div>
              <div className="mt-1 text-[#9fb0ba]">{showcaseTemplate.intro}</div>
              <div className="mt-2 space-y-1 text-[#8ea1ab]">
                {showcaseTemplate.prompts.map((prompt) => (
                  <div key={prompt}>- {prompt}</div>
                ))}
              </div>
              <div className="mt-2 text-[#7bd0b6]">{showcaseTemplate.cta}</div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};

export default CreatorAnalyticsPanel;
