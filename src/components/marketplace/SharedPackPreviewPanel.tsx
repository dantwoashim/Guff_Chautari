import React, { useEffect, useMemo, useState } from 'react';
import {
  extractMarketplaceShareTokenFromLocation,
  installTemplate,
  installVerticalPack,
  parseMarketplaceShareLink,
  resolveMarketplaceSharePreview,
  type MarketplaceSharePreview,
} from '../../marketplace';

interface SharedPackPreviewPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

export const SharedPackPreviewPanel: React.FC<SharedPackPreviewPanelProps> = ({ userId }) => {
  const [status, setStatus] = useState('');
  const [shareUrl, setShareUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setShareUrl(window.location.href);
  }, []);

  const parsed = useMemo(() => {
    if (!shareUrl) return null;
    try {
      const token = extractMarketplaceShareTokenFromLocation(shareUrl);
      if (!token) return null;
      return parseMarketplaceShareLink(shareUrl);
    } catch {
      return null;
    }
  }, [shareUrl]);

  const preview = useMemo<MarketplaceSharePreview | null>(() => {
    if (!parsed || !shareUrl) return null;
    try {
      return resolveMarketplaceSharePreview({
        userId,
        shareUrl,
      });
    } catch {
      return null;
    }
  }, [parsed, shareUrl, userId]);

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className={panelClass}>
          <h2 className="text-lg font-semibold text-[#e9edef]">Shared Marketplace Preview</h2>
          <p className="mt-1 text-sm text-[#8696a0]">
            Opened from a shareable marketplace link. Review details and install directly.
          </p>
        </section>

        {!parsed || !preview ? (
          <section className={panelClass}>
            <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              Share metadata was not found or is invalid.
            </div>
          </section>
        ) : preview.type === 'pack' ? (
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Pack Preview</h3>
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
              <div className="text-sm text-[#e9edef]">{preview.name}</div>
              <div className="mt-1 text-[#8fa1ab]">{preview.description}</div>
              <div className="mt-2 text-[11px] text-[#7bd0b6]">
                {preview.socialProof.usersUsing} users using this pack
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="rounded border border-[#2b3a43] bg-[#101a20] p-2">
                  <div className="text-[11px] text-[#7f929c]">Persona Template</div>
                  <div className="text-[#dfe7eb]">
                    {preview.components.personaTemplate?.template.metadata.name ?? 'Unavailable'}
                  </div>
                </div>
                <div className="rounded border border-[#2b3a43] bg-[#101a20] p-2">
                  <div className="text-[11px] text-[#7f929c]">Workflow Template</div>
                  <div className="text-[#dfe7eb]">
                    {preview.components.workflowTemplate?.template.metadata.name ?? 'Unavailable'}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-[#7f929c]">
                Knowledge starter: {preview.components.knowledgeTitle}
              </div>
              <div className="mt-2 text-[11px] text-[#8ea1ab]">
                Benchmark: {preview.benchmark ? `${preview.benchmark.badgeTier} (${(preview.benchmark.compositeScore * 100).toFixed(2)}%)` : 'n/a'}
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded border border-[#00a884] px-3 py-1.5 text-xs text-[#aef5e9] hover:bg-[#12453f]"
                onClick={() => {
                  try {
                    const result = installVerticalPack({
                      userId,
                      packId: preview.id,
                    });
                    setStatus(result.summary);
                  } catch (error) {
                    setStatus(error instanceof Error ? error.message : 'Install failed.');
                  }
                }}
              >
                Install Pack
              </button>
            </div>
          </section>
        ) : (
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Template Preview</h3>
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
              <div className="text-sm text-[#e9edef]">{preview.template.template.metadata.name}</div>
              <div className="mt-1 text-[#8fa1ab]">{preview.template.template.metadata.description}</div>
              <div className="mt-2 text-[11px] text-[#7f929c]">
                rating: {preview.template.rating ? `${preview.template.rating.average.toFixed(2)} (${preview.template.rating.votes})` : 'n/a'}
              </div>
              <div className="mt-1 text-[11px] text-[#7f929c]">
                installs: {preview.template.stats?.installCount ?? 0}
              </div>
              <div className="mt-2 text-[11px] text-[#8ea1ab]">
                Benchmark: {preview.benchmark ? `${preview.benchmark.badgeTier} (${(preview.benchmark.compositeScore * 100).toFixed(2)}%)` : 'n/a'}
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded border border-[#00a884] px-3 py-1.5 text-xs text-[#aef5e9] hover:bg-[#12453f]"
                onClick={() => {
                  try {
                    const result = installTemplate({
                      userId,
                      templateId: preview.id,
                    });
                    setStatus(result.summary);
                  } catch (error) {
                    setStatus(error instanceof Error ? error.message : 'Install failed.');
                  }
                }}
              >
                Install Template
              </button>
            </div>
          </section>
        )}

        {status ? (
          <div className="rounded border border-[#31596b] bg-[#102531] px-3 py-2 text-xs text-[#b8dbeb]">{status}</div>
        ) : null}
      </div>
    </div>
  );
};

export default SharedPackPreviewPanel;
