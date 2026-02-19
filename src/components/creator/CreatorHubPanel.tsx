import React, { useMemo, useState } from 'react';
import {
  CREATOR_TIER_DEFINITIONS,
  buildCreatorProfile,
  castCreatorReviewVote,
  listCreatorReviewQueueWithAttribution,
} from '../../creator';

interface CreatorHubPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const widgetSnippet = `<script src="https://cdn.ashim.local/widget/embed.js"></script>
<script>
  window.AshimWidget?.mount({
    target: "#ashim-widget",
    personaId: "your-persona-id",
    byokProvider: "gemini"
  });
</script>
<div id="ashim-widget"></div>`;

export const CreatorHubPanel: React.FC<CreatorHubPanelProps> = ({ userId }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [status, setStatus] = useState('');

  const refresh = () => setRefreshTick((tick) => tick + 1);

  const profile = useMemo(() => {
    void refreshTick;
    return buildCreatorProfile(userId);
  }, [refreshTick, userId]);

  const reviewQueue = useMemo(() => {
    void refreshTick;
    return listCreatorReviewQueueWithAttribution({
      userId,
      status: 'community_review',
    }).slice(0, 6);
  }, [refreshTick, userId]);

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Creator Hub</h2>
            <p className="text-sm text-[#8696a0]">
              Creator program tiers, community quality review, and embeddable widget launch path.
            </p>
          </div>
          <div className="text-xs text-[#8696a0]">Tier: {profile.currentTier}</div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className={`${panelClass} lg:col-span-2`}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Creator Program Tiers</h3>
            <div className="space-y-2">
              {CREATOR_TIER_DEFINITIONS.map((definition) => (
                <div key={definition.tier} className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
                  <div className="text-[#e9edef]">
                    {definition.tier} {profile.currentTier === definition.tier ? '(current)' : ''}
                  </div>
                  <div className="text-[#8ea1ab]">
                    Min approved templates: {definition.minApprovedTemplates} • Min rating:{' '}
                    {definition.minAverageRating.toFixed(1)} • Min benchmark:{' '}
                    {(definition.minCompositeScore * 100).toFixed(0)}%
                  </div>
                  <div className="mt-1 text-[#7f929c]">Benefits: {definition.benefits.join(', ')}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Creator Profile</h3>
            <div className="space-y-1 text-xs text-[#9fb0ba]">
              <div>Approved templates: {profile.approvedTemplates}</div>
              <div>Pending templates: {profile.pendingTemplates}</div>
              <div>Rejected templates: {profile.rejectedTemplates}</div>
              <div>Average rating: {profile.averageRating.toFixed(2)}</div>
              <div>Benchmark score: {(profile.benchmarkCompositeScore * 100).toFixed(1)}%</div>
              <div>Benchmark badge: {profile.benchmarkBadgeTier ?? 'N/A'}</div>
            </div>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Community Review Workflow</h3>
            <div className="space-y-2">
              {reviewQueue.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                  No templates waiting for review.
                </div>
              ) : (
                reviewQueue.map((submission) => (
                  <div key={submission.id} className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
                    <div className="text-[#e9edef]">{submission.template.metadata.name}</div>
                    <div className="text-[11px] text-[#7f929c]">
                      Status: {submission.status} • Votes: +{submission.votes.up}/-{submission.votes.down}
                    </div>
                    {submission.attribution ? (
                      <div className="mt-1 text-[11px] text-[#8ea1ab]">
                        Attribution:{' '}
                        {submission.attribution
                          .map((member) => `${member.displayName} (${member.roleLabel})`)
                          .join(', ')}
                      </div>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="rounded border border-[#3a6d52] px-2 py-1 text-[11px] text-[#a8e5c4]"
                        onClick={() => {
                          castCreatorReviewVote({
                            userId,
                            submissionId: submission.id,
                            vote: 'up',
                          });
                          setStatus(`Upvoted submission ${submission.id}.`);
                          refresh();
                        }}
                      >
                        Upvote
                      </button>
                      <button
                        type="button"
                        className="rounded border border-[#7b3b3b] px-2 py-1 text-[11px] text-[#f0bbbb]"
                        onClick={() => {
                          castCreatorReviewVote({
                            userId,
                            submissionId: submission.id,
                            vote: 'down',
                          });
                          setStatus(`Downvoted submission ${submission.id}.`);
                          refresh();
                        }}
                      >
                        Downvote
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Embeddable Widget Snippet</h3>
            <p className="mb-2 text-xs text-[#8ea1ab]">
              Drop this snippet on any external page. Widget uses visitor BYOK at runtime.
            </p>
            <pre className="overflow-x-auto rounded border border-[#27343d] bg-[#0f171c] p-2 text-[11px] text-[#9fb0ba]">
              {widgetSnippet}
            </pre>
          </section>
        </div>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Published Templates</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {profile.publishedTemplates.length === 0 ? (
              <div className="text-xs text-[#8ea1ab]">No approved templates yet.</div>
            ) : (
              profile.publishedTemplates.map((template) => (
                <div key={template.metadata.id} className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
                  <div className="text-[#e9edef]">{template.metadata.name}</div>
                  <div className="text-[11px] text-[#7f929c]">
                    {template.kind} • {template.metadata.category}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {status ? (
          <div className="rounded border border-[#31596b] bg-[#102531] px-3 py-2 text-xs text-[#b8dbeb]">{status}</div>
        ) : null}
      </div>
    </div>
  );
};

export default CreatorHubPanel;
