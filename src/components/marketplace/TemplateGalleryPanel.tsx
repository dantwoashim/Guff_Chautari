import React, { useMemo, useState } from 'react';
import {
  exportTemplatePackage,
  getTemplateBadges,
  getTemplateCommunityStats,
  getTemplateRating,
  installTemplate,
  listInstalledTemplateIds,
  listMarketplaceAuthors,
  listMarketplaceTags,
  listTemplateReviews,
  listTemplateSubmissions,
  listTemplates,
  rateTemplate,
  recordTemplateUsage,
  reviewTemplateSubmissionDecision,
  voteOnSubmission,
  type TemplateCategory,
  type TemplateKind,
} from '../../marketplace';
import { SubmitTemplatePanel } from './SubmitTemplatePanel';

interface TemplateGalleryPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const downloadText = (filename: string, content: string): void => {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const TemplateGalleryPanel: React.FC<TemplateGalleryPanelProps> = ({ userId }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [status, setStatus] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | TemplateKind>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TemplateCategory>('all');
  const [authorFilter, setAuthorFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [ratingInput, setRatingInput] = useState(5);
  const [reviewTextInput, setReviewTextInput] = useState('');

  const refresh = () => setRefreshTick((tick) => tick + 1);

  const templates = useMemo(() => {
    void refreshTick;
    return listTemplates({
      userId,
      kind: kindFilter,
      category: categoryFilter,
      search,
      author: authorFilter === 'all' ? undefined : authorFilter,
      tags: tagFilter === 'all' ? undefined : [tagFilter],
    });
  }, [authorFilter, categoryFilter, kindFilter, refreshTick, search, tagFilter, userId]);

  const authors = useMemo(() => {
    void refreshTick;
    return listMarketplaceAuthors(userId);
  }, [refreshTick, userId]);

  const tags = useMemo(() => {
    void refreshTick;
    return listMarketplaceTags(userId);
  }, [refreshTick, userId]);

  const installedIds = useMemo(() => {
    void refreshTick;
    return new Set(listInstalledTemplateIds(userId));
  }, [refreshTick, userId]);

  const selectedTemplate = useMemo(() => {
    if (templates.length === 0) return null;
    if (!selectedTemplateId) return templates[0];
    return templates.find((template) => template.metadata.id === selectedTemplateId) ?? templates[0];
  }, [selectedTemplateId, templates]);

  const rating = useMemo(() => {
    void refreshTick;
    if (!selectedTemplate) return null;
    return getTemplateRating({
      userId,
      templateId: selectedTemplate.metadata.id,
    });
  }, [selectedTemplate, userId, refreshTick]);

  const selectedTemplateBadges = useMemo(() => {
    void refreshTick;
    if (!selectedTemplate) return [];
    return getTemplateBadges({
      userId,
      templateId: selectedTemplate.metadata.id,
    });
  }, [refreshTick, selectedTemplate, userId]);

  const selectedTemplateStats = useMemo(() => {
    void refreshTick;
    if (!selectedTemplate) return null;
    return getTemplateCommunityStats({
      userId,
      templateId: selectedTemplate.metadata.id,
    });
  }, [refreshTick, selectedTemplate, userId]);

  const selectedTemplateReviews = useMemo(() => {
    void refreshTick;
    if (!selectedTemplate) return [];
    return listTemplateReviews({
      userId,
      templateId: selectedTemplate.metadata.id,
      limit: 5,
    });
  }, [refreshTick, selectedTemplate, userId]);

  const submissions = useMemo(() => {
    void refreshTick;
    return listTemplateSubmissions({ userId }).slice(0, 8);
  }, [refreshTick, userId]);

  const selectedTemplateUsageCount = selectedTemplateStats?.usageCount ?? 0;
  const usesUntilRating = Math.max(0, 3 - selectedTemplateUsageCount);

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Template Gallery</h2>
            <p className="text-sm text-[#8696a0]">
              Browse curated persona/workflow templates, install, and submit community contributions.
            </p>
          </div>
          <div className="text-xs text-[#8696a0]">{templates.length} template(s) visible</div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Browse</h3>
            <div className="mb-2 flex gap-2">
              {(['all', 'persona', 'workflow'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`rounded border px-2 py-1 text-xs ${
                    kindFilter === filter
                      ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                      : 'border-[#313d45] bg-[#0f171c] text-[#9fb0ba]'
                  }`}
                  onClick={() => setKindFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
            <div className="mb-2 grid gap-2">
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)}
                className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
              >
                <option value="all">All categories</option>
                {[
                  'productivity',
                  'wellbeing',
                  'learning',
                  'creative',
                  'engineering',
                  'operations',
                ].map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                value={authorFilter}
                onChange={(event) => setAuthorFilter(event.target.value)}
                className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
              >
                <option value="all">All authors</option>
                {authors.map((author) => (
                  <option key={author} value={author}>
                    {author}
                  </option>
                ))}
              </select>
              <select
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
                className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
              >
                <option value="all">All tags</option>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search templates..."
              className="mb-3 w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            />
            <div className="space-y-2">
              {templates.map((template) => {
                const selected = selectedTemplate?.metadata.id === template.metadata.id;
                return (
                  <button
                    key={template.metadata.id}
                    type="button"
                    className={`w-full rounded border px-3 py-2 text-left text-xs ${
                      selected
                        ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                        : 'border-[#313d45] bg-[#0f171c] text-[#9fb0ba] hover:border-[#4a5961]'
                    }`}
                    onClick={() => setSelectedTemplateId(template.metadata.id)}
                  >
                    <div className="text-sm text-[#e9edef]">{template.metadata.name}</div>
                    <div className="mt-1 text-[11px] text-[#7f929c]">
                      {template.kind} • {template.metadata.category}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {getTemplateBadges({ userId, templateId: template.metadata.id }).map((badge) => (
                        <span
                          key={`${template.metadata.id}-${badge.id}`}
                          className="rounded border border-[#365166] bg-[#102531] px-1.5 py-0.5 text-[10px] text-[#b8dbeb]"
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={`${panelClass} lg:col-span-2`}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Template Preview</h3>
            {selectedTemplate ? (
              <>
                <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                  <div className="text-sm text-[#e9edef]">{selectedTemplate.metadata.name}</div>
                  <div className="mt-1 text-[#8fa1ab]">{selectedTemplate.metadata.description}</div>
                  <div className="mt-2 text-[11px] text-[#7f929c]">
                    Tags: {selectedTemplate.metadata.tags.join(', ')}
                  </div>
                  <div className="text-[11px] text-[#7f929c]">
                    Kind: {selectedTemplate.kind} • Version: {selectedTemplate.metadata.version}
                  </div>
                  <div className="mt-2 text-[11px] text-[#7f929c]">
                    Installed: {installedIds.has(selectedTemplate.metadata.id) ? 'yes' : 'no'}
                  </div>
                  <div className="mt-2 text-[11px] text-[#7f929c]">
                    Install count: {selectedTemplateStats?.installCount ?? 0}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedTemplateBadges.length === 0 ? (
                      <span className="text-[11px] text-[#7f929c]">No quality badges yet.</span>
                    ) : (
                      selectedTemplateBadges.map((badge) => (
                        <span
                          key={badge.id}
                          title={badge.reason}
                          className="rounded border border-[#365166] bg-[#102531] px-2 py-0.5 text-[11px] text-[#b8dbeb]"
                        >
                          {badge.label}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-[#00a884] px-3 py-1.5 text-xs text-[#aef5e9] hover:bg-[#12453f]"
                    onClick={() => {
                      const result = installTemplate({
                        userId,
                        templateId: selectedTemplate.metadata.id,
                      });
                      setStatus(result.summary);
                      refresh();
                    }}
                  >
                    Install Template
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[#4f6f84] px-3 py-1.5 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                    onClick={() => {
                      downloadText(
                        `${selectedTemplate.metadata.id}.template.json`,
                        exportTemplatePackage(selectedTemplate)
                      );
                      setStatus(`Exported ${selectedTemplate.metadata.id}.template.json`);
                    }}
                  >
                    Export
                  </button>
                  <button
                    type="button"
                    disabled={!installedIds.has(selectedTemplate.metadata.id)}
                    className={`rounded border px-3 py-1.5 text-xs ${
                      installedIds.has(selectedTemplate.metadata.id)
                        ? 'border-[#5a8d5f] text-[#bceac1] hover:bg-[#173125]'
                        : 'cursor-not-allowed border-[#3b4b54] text-[#718690]'
                    }`}
                    onClick={() => {
                      try {
                        const stats = recordTemplateUsage({
                          userId,
                          templateId: selectedTemplate.metadata.id,
                        });
                        setStatus(
                          `Recorded template use. Usage count is now ${stats.usageCount} for ${selectedTemplate.metadata.name}.`
                        );
                        refresh();
                      } catch (error) {
                        setStatus(error instanceof Error ? error.message : 'Failed to record template usage.');
                      }
                    }}
                  >
                    Record Use
                  </button>
                </div>

                <div className="mt-3 rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#9fb0ba]">
                  <div className="mb-2 text-[#e9edef]">Template Rating</div>
                  <div className="mb-2">
                    Average: {rating ? rating.average.toFixed(2) : 'n/a'} ({rating?.votes ?? 0} vote(s))
                  </div>
                  <div className="mb-2 text-[11px] text-[#8ea1ab]">
                    Usage count: {selectedTemplateUsageCount} (rate after 3 uses)
                  </div>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        className={`rounded border px-2 py-1 text-[11px] ${
                          ratingInput === score
                            ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                            : 'border-[#4f6f84] text-[#bfd8e8] hover:bg-[#1d3140]'
                        }`}
                        onClick={() => setRatingInput(score)}
                      >
                        {score} star{score === 1 ? '' : 's'}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={reviewTextInput}
                    onChange={(event) => setReviewTextInput(event.target.value)}
                    placeholder="Optional text review..."
                    className="mb-2 h-20 w-full rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb]"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={usesUntilRating > 0 || !installedIds.has(selectedTemplate.metadata.id)}
                      className={`rounded border px-2 py-1 text-xs ${
                        usesUntilRating === 0 && installedIds.has(selectedTemplate.metadata.id)
                          ? 'border-[#4f6f84] text-[#bfd8e8] hover:bg-[#1d3140]'
                          : 'cursor-not-allowed border-[#3b4b54] text-[#718690]'
                      }`}
                      onClick={() => {
                        try {
                          const nextRating = rateTemplate({
                            userId,
                            templateId: selectedTemplate.metadata.id,
                            score: ratingInput,
                            reviewText: reviewTextInput,
                          });
                          setStatus(
                            `Rating saved: ${nextRating.average.toFixed(2)} average across ${nextRating.votes} vote(s).`
                          );
                          setReviewTextInput('');
                          refresh();
                        } catch (error) {
                          setStatus(error instanceof Error ? error.message : 'Failed to rate template.');
                        }
                      }}
                    >
                      Rate
                    </button>
                    {usesUntilRating > 0 ? (
                      <span className="text-[11px] text-[#f3c2c2]">
                        {usesUntilRating} more use(s) required before rating.
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-1 text-[11px]">
                    <div className="text-[#e9edef]">Recent Reviews</div>
                    {selectedTemplateReviews.length === 0 ? (
                      <div className="text-[#7f929c]">No text reviews yet.</div>
                    ) : (
                      selectedTemplateReviews.map((review) => (
                        <div
                          key={review.id}
                          className="rounded border border-[#27343d] bg-[#101a20] px-2 py-1 text-[#9fb0ba]"
                        >
                          <div className="text-[#cbd8de]">
                            score {review.score}/5 • uses {review.usageCountAtReview}
                          </div>
                          {review.text ? <div className="mt-0.5">{review.text}</div> : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                No template selected.
              </div>
            )}
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SubmitTemplatePanel
            userId={userId}
            panelClassName={panelClass}
            onStatus={setStatus}
            onSubmitted={refresh}
          />

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Community Review Queue</h3>
            <div className="space-y-2">
              {submissions.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                  No submissions yet.
                </div>
              ) : (
                submissions.map((submission) => (
                  <div key={submission.id} className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
                    <div className="text-[#e9edef]">
                      {submission.template.metadata.name} ({submission.status})
                    </div>
                    <div className="text-[11px] text-[#7f929c]">
                      submitter: {submission.submitterProfile.displayName} • quality{' '}
                      {Math.round(submission.qualityScore * 100)}%
                    </div>
                    <div className="text-[11px] text-[#7f929c]">
                      votes: +{submission.votes.up} / -{submission.votes.down}
                    </div>
                    {submission.reviewHistory.length > 0 ? (
                      <div className="mt-1 text-[11px] text-[#7f929c]">
                        latest review: {submission.reviewHistory[submission.reviewHistory.length - 1].decision}
                      </div>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="rounded border border-[#3a6d52] px-2 py-1 text-[11px] text-[#a8e5c4]"
                        onClick={() => {
                          voteOnSubmission({
                            userId,
                            submissionId: submission.id,
                            vote: 'up',
                          });
                          refresh();
                        }}
                      >
                        Upvote
                      </button>
                      <button
                        type="button"
                        className="rounded border border-[#7b3b3b] px-2 py-1 text-[11px] text-[#f0bbbb]"
                        onClick={() => {
                          voteOnSubmission({
                            userId,
                            submissionId: submission.id,
                            vote: 'down',
                          });
                          refresh();
                        }}
                      >
                        Downvote
                      </button>
                      <button
                        type="button"
                        className="rounded border border-[#3a6d52] px-2 py-1 text-[11px] text-[#a8e5c4]"
                        onClick={() => {
                          reviewTemplateSubmissionDecision({
                            userId,
                            submissionId: submission.id,
                            reviewerId: 'manual-moderator',
                            decision: 'approve',
                            notes: 'Approved from gallery queue.',
                          });
                          refresh();
                        }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="rounded border border-[#6b5a2a] px-2 py-1 text-[11px] text-[#f3e2b3]"
                        onClick={() => {
                          reviewTemplateSubmissionDecision({
                            userId,
                            submissionId: submission.id,
                            reviewerId: 'manual-moderator',
                            decision: 'request_changes',
                            notes: 'Please refine template details and retry.',
                          });
                          refresh();
                        }}
                      >
                        Request Changes
                      </button>
                      <button
                        type="button"
                        className="rounded border border-[#7b3b3b] px-2 py-1 text-[11px] text-[#f0bbbb]"
                        onClick={() => {
                          reviewTemplateSubmissionDecision({
                            userId,
                            submissionId: submission.id,
                            reviewerId: 'manual-moderator',
                            decision: 'reject',
                            notes: 'Rejected for quality/safety reasons.',
                          });
                          refresh();
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {status ? (
          <div className="rounded border border-[#31596b] bg-[#102531] px-3 py-2 text-xs text-[#b8dbeb]">{status}</div>
        ) : null}
      </div>
    </div>
  );
};

export default TemplateGalleryPanel;
