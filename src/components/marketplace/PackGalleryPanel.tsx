import React, { useMemo, useState } from 'react';
import {
  buildCreatorInterviewTemplate,
  getWeeklyFeaturedCreatorSpotlight,
  listFeaturedCreatorSpotlights,
} from '../../creator';
import {
  buildMarketplaceBehaviorSnapshot,
  createMarketplaceShareLink,
  getPackSocialProof,
  installVerticalPack,
  listRegistryCreatorLeaderboard,
  listTrendingPacks,
  listVerticalPacks,
  previewVerticalPack,
  recommendMarketplacePacks,
  type VerticalPackId,
} from '../../marketplace';

interface PackGalleryPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

export const PackGalleryPanel: React.FC<PackGalleryPanelProps> = ({ userId }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedPackId, setSelectedPackId] = useState<VerticalPackId | null>(null);
  const [status, setStatus] = useState('');

  const refresh = () => setRefreshTick((tick) => tick + 1);

  const packs = useMemo(() => {
    void refreshTick;
    return listVerticalPacks({ search });
  }, [refreshTick, search]);

  const selectedPack = useMemo(() => {
    if (packs.length === 0) return null;
    if (!selectedPackId) return packs[0];
    return packs.find((pack) => pack.id === selectedPackId) ?? packs[0];
  }, [packs, selectedPackId]);

  const preview = useMemo(() => {
    if (!selectedPack) return null;
    void refreshTick;
    return previewVerticalPack({
      userId,
      packId: selectedPack.id,
    });
  }, [selectedPack, userId, refreshTick]);

  const leaderboard = useMemo(() => {
    void refreshTick;
    return listRegistryCreatorLeaderboard({ limit: 6 });
  }, [refreshTick]);

  const packSocialProofById = useMemo(() => {
    void refreshTick;
    const entries = packs.map((pack) => [
      pack.id,
      getPackSocialProof({
        packId: pack.id,
      }),
    ] as const);
    return new Map(entries);
  }, [packs, refreshTick]);

  const trending = useMemo(() => {
    void refreshTick;
    return listTrendingPacks({
      limit: 4,
      windowDays: 7,
      minInstalls: 5,
    });
  }, [refreshTick]);

  const recommendations = useMemo(() => {
    void refreshTick;
    const snapshot = buildMarketplaceBehaviorSnapshot({
      userId,
    });
    return recommendMarketplacePacks(snapshot, {
      limit: 3,
    });
  }, [refreshTick, userId]);

  const weeklyCreatorSpotlight = useMemo(() => {
    void refreshTick;
    return getWeeklyFeaturedCreatorSpotlight({
      userId,
    });
  }, [refreshTick, userId]);

  const creatorSpotlightRanking = useMemo(() => {
    void refreshTick;
    return listFeaturedCreatorSpotlights({
      userId,
      limit: 3,
    });
  }, [refreshTick, userId]);

  const spotlightInterview = useMemo(() => {
    if (!weeklyCreatorSpotlight.featured) return null;
    return buildCreatorInterviewTemplate({
      spotlight: weeklyCreatorSpotlight.featured,
      weekStartIso: weeklyCreatorSpotlight.weekStartIso,
    });
  }, [weeklyCreatorSpotlight]);

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Vertical Pack Gallery</h2>
            <p className="text-sm text-[#8696a0]">
              Install full operating stacks in one click: persona + workflow + starter knowledge.
            </p>
          </div>
          <div className="text-xs text-[#8696a0]">{packs.length} pack(s)</div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Browse Packs</h3>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search packs..."
              className="mb-3 w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            />
            <div className="space-y-2">
              {packs.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                  No packs match your search.
                </div>
              ) : (
                packs.map((pack) => {
                  const selected = selectedPack?.id === pack.id;
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      className={`w-full rounded border px-3 py-2 text-left text-xs ${
                        selected
                          ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                          : 'border-[#313d45] bg-[#0f171c] text-[#9fb0ba] hover:border-[#4a5961]'
                      }`}
                      onClick={() => setSelectedPackId(pack.id)}
                    >
                      <div className="text-sm text-[#e9edef]">{pack.name}</div>
                      <div className="mt-1 text-[11px] text-[#7f929c]">{pack.audience}</div>
                      <div className="mt-1 text-[11px] text-[#8fa1ab]">{pack.description}</div>
                      <div className="mt-1 text-[11px] text-[#7bd0b6]">
                        {packSocialProofById.get(pack.id)?.usersUsing ?? 0} users using this pack
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Pack Preview</h3>
            {selectedPack && preview ? (
              <>
                <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                  <div className="text-sm text-[#e9edef]">{selectedPack.name}</div>
                  <div className="mt-1 text-[#8fa1ab]">{selectedPack.description}</div>
                  <div className="mt-2 text-[11px] text-[#7f929c]">Audience: {selectedPack.audience}</div>

                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <div className="rounded border border-[#2b3a43] bg-[#101a20] p-2">
                      <div className="text-[11px] text-[#7f929c]">Persona Template</div>
                      <div className="text-[#dfe7eb]">{selectedPack.components.personaTemplateId}</div>
                    </div>
                    <div className="rounded border border-[#2b3a43] bg-[#101a20] p-2">
                      <div className="text-[11px] text-[#7f929c]">Workflow Template</div>
                      <div className="text-[#dfe7eb]">{selectedPack.components.workflowTemplateId}</div>
                    </div>
                    <div className="rounded border border-[#2b3a43] bg-[#101a20] p-2">
                      <div className="text-[11px] text-[#7f929c]">Knowledge Template</div>
                      <div className="text-[#dfe7eb]">{selectedPack.components.knowledgeTemplate.title}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-[11px] text-[#7f929c]">
                    Installed components: {preview.installedTemplateIds.length}/2
                  </div>
                  {preview.missingTemplateIds.length > 0 ? (
                    <div className="mt-1 text-[11px] text-[#f3c2c2]">
                      Missing: {preview.missingTemplateIds.join(', ')}
                    </div>
                  ) : (
                    <div className="mt-1 text-[11px] text-[#bde8c8]">Templates already installed.</div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-[#00a884] px-3 py-1.5 text-xs text-[#aef5e9] hover:bg-[#12453f]"
                    onClick={() => {
                      try {
                        const result = installVerticalPack({
                          userId,
                          packId: selectedPack.id,
                        });
                        setStatus(result.summary);
                        refresh();
                      } catch (error) {
                        setStatus(error instanceof Error ? error.message : 'Failed to install vertical pack.');
                      }
                    }}
                  >
                    One-click Install
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[#4f6f84] px-3 py-1.5 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                    onClick={async () => {
                      try {
                        const shareUrl = createMarketplaceShareLink({
                          type: 'pack',
                          id: selectedPack.id,
                        });
                        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                          await navigator.clipboard.writeText(shareUrl);
                          setStatus(`Share link copied: ${shareUrl}`);
                        } else {
                          setStatus(`Share link generated: ${shareUrl}`);
                        }
                      } catch (error) {
                        setStatus(error instanceof Error ? error.message : 'Unable to generate share link.');
                      }
                    }}
                  >
                    Share Pack
                  </button>
                </div>

                <div className="mt-3 rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#9fb0ba]">
                  <div className="text-[#e9edef]">Knowledge Starter</div>
                  <div className="mt-1 text-[11px] text-[#8ea1ab]">
                    {selectedPack.components.knowledgeTemplate.text}
                  </div>
                  <div className="mt-2 text-[11px] text-[#7bd0b6]">
                    Social proof: {packSocialProofById.get(selectedPack.id)?.usersUsing ?? 0} active users
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                No pack selected.
              </div>
            )}
          </section>
        </div>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Featured Creator Spotlight</h3>
          {weeklyCreatorSpotlight.featured ? (
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
              <div className="text-sm text-[#e9edef]">{weeklyCreatorSpotlight.featured.creatorUserId}</div>
              <div className="mt-1 text-[#8ea1ab]">
                Rotates weekly. Current slot started{' '}
                {new Date(weeklyCreatorSpotlight.weekStartIso).toLocaleDateString()}.
              </div>
              <div className="mt-1 text-[#9fb0ba]">
                score {(weeklyCreatorSpotlight.featured.score * 100).toFixed(2)} • installs{' '}
                {weeklyCreatorSpotlight.featured.installs} • rating{' '}
                {weeklyCreatorSpotlight.featured.averageRating.toFixed(2)}
              </div>
            </div>
          ) : (
            <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              No featured creator yet.
            </div>
          )}

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {creatorSpotlightRanking.length === 0 ? (
              <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                Spotlight ranking will appear after approved creator templates accumulate signal.
              </div>
            ) : (
              creatorSpotlightRanking.map((record) => (
                <div key={record.creatorUserId} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                  <div className="text-[#e9edef]">
                    #{record.rank} {record.creatorUserId}
                  </div>
                  <div className="mt-1 text-[#9fb0ba]">
                    installs {record.installs} • rating {record.averageRating.toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </div>

          {spotlightInterview ? (
            <div className="mt-3 rounded border border-[#27343d] bg-[#101a20] p-3 text-xs text-[#9fb0ba]">
              <div className="text-[#e9edef]">{spotlightInterview.headline}</div>
              <div className="mt-1">{spotlightInterview.prompts[0]}</div>
            </div>
          ) : null}
        </section>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Recommended for You</h3>
          {recommendations.recommendations.length === 0 ? (
            <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              Not enough usage signal yet. Install and use packs to improve recommendations.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-3">
              {recommendations.recommendations.map((record) => (
                <button
                  key={record.packId}
                  type="button"
                  onClick={() => setSelectedPackId(record.packId)}
                  className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-left text-xs text-[#9fb0ba] hover:border-[#4a5961]"
                >
                  <div className="text-[#e9edef]">{record.packId}</div>
                  <div className="mt-1 text-[#7bd0b6]">score {(record.score * 100).toFixed(1)}%</div>
                  {record.reasons.length > 0 ? (
                    <div className="mt-1 text-[11px] text-[#8ea1ab]">{record.reasons[0]}</div>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Trending This Week</h3>
          {trending.length === 0 ? (
            <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              Not enough pack installs yet for a trending leaderboard.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {trending.map((record) => (
                <div
                  key={record.packId}
                  className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#9fb0ba]"
                >
                  <div className="text-[#e9edef]">{record.packId}</div>
                  <div className="mt-1">
                    installs (7d): {record.installsInWindow} • users: {record.uniqueInstallUsersInWindow}
                  </div>
                  <div className="mt-1 text-[#7bd0b6]">velocity: {record.velocityScore.toFixed(2)}/day</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Registry Creator Signal</h3>
          <div className="text-xs text-[#8ea1ab]">
            Reputation blends quality signals, adoption, ratings, benchmark score, and release consistency.
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {leaderboard.length === 0 ? (
              <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                No registry creators yet. Publish template versions to populate this board.
              </div>
            ) : (
              leaderboard.map((entry) => (
                <div
                  key={entry.creatorUserId}
                  className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs"
                >
                  <div className="text-[#e9edef]">{entry.creatorUserId}</div>
                  <div className="mt-1 text-[#9fb0ba]">
                    tier: {entry.tier} • score {(entry.score * 100).toFixed(1)}%
                  </div>
                  <div className="mt-1 text-[#7f929c]">
                    installs {entry.signals.installCount} • rating {entry.signals.ratingAverage.toFixed(2)}
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

export default PackGalleryPanel;
