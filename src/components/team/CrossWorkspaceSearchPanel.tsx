import React, { useMemo, useState } from 'react';
import { searchAcrossWorkspaces, type CrossWorkspaceSearchResponse } from '../../team/crossWorkspaceSearch';
import { workspaceManager } from '../../team/workspaceManager';

interface CrossWorkspaceSearchPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const formatTimestamp = (iso: string): string => {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString();
};

export const CrossWorkspaceSearchPanel: React.FC<CrossWorkspaceSearchPanelProps> = ({ userId }) => {
  const [query, setQuery] = useState('');
  const [includePersonal, setIncludePersonal] = useState(true);
  const [limit, setLimit] = useState(30);
  const [workspaceFilter, setWorkspaceFilter] = useState<'all' | 'personal' | string>('all');
  const [result, setResult] = useState<CrossWorkspaceSearchResponse | null>(null);
  const [status, setStatus] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const accessibleWorkspaces = useMemo(() => workspaceManager.listWorkspacesForUser(userId), [userId]);

  const filteredResults = useMemo(() => {
    if (!result) return [];
    if (workspaceFilter === 'all') return result.results;
    if (workspaceFilter === 'personal') {
      return result.results.filter((item) => item.scope === 'personal');
    }
    return result.results.filter((item) => item.workspaceId === workspaceFilter);
  }, [result, workspaceFilter]);

  const resultBreakdown = useMemo(() => {
    const counts = {
      activity: 0,
      knowledge: 0,
      workflow: 0,
    };
    for (const entry of filteredResults) {
      counts[entry.domain] += 1;
    }
    return counts;
  }, [filteredResults]);

  const handleSearch = () => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setStatus('Enter a search query first.');
      return;
    }

    setIsSearching(true);
    try {
      const response = searchAcrossWorkspaces({
        actorUserId: userId,
        query: normalizedQuery,
        includePersonal,
        limit,
      });
      setResult(response);
      setStatus(
        `Searched ${response.searchedWorkspaceIds.length} workspace(s); ${response.totalResults} result(s) returned.`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Search failed.');
      setResult(null);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Cross-Workspace Search</h2>
            <p className="text-sm text-[#8696a0]">
              Search activity, knowledge, and workflows across personal and team workspaces with RBAC-safe visibility.
            </p>
          </div>
        </div>

        <section className={panelClass}>
          <div className="grid gap-2 md:grid-cols-[1fr_120px_auto]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search terms (for example: launch, risk, benchmark)"
              className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            />
            <input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(event) => setLimit(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
              className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            />
            <button
              type="button"
              disabled={isSearching}
              className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140] disabled:opacity-60"
              onClick={handleSearch}
            >
              Search
            </button>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-[#c7d0d6]">
              <input
                type="checkbox"
                checked={includePersonal}
                onChange={(event) => setIncludePersonal(event.target.checked)}
              />
              Include personal scope
            </label>
            <select
              value={workspaceFilter}
              onChange={(event) => setWorkspaceFilter(event.target.value)}
              className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            >
              <option value="all">all origins</option>
              <option value="personal">personal only</option>
              {accessibleWorkspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {result ? (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Activity Hits</div>
                <div className="mt-1 text-xl text-[#e9edef]">{resultBreakdown.activity}</div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Knowledge Hits</div>
                <div className="mt-1 text-xl text-[#e9edef]">{resultBreakdown.knowledge}</div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Workflow Hits</div>
                <div className="mt-1 text-xl text-[#e9edef]">{resultBreakdown.workflow}</div>
              </article>
            </section>

            <section className={panelClass}>
              <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Results</h3>
              <div className="space-y-2">
                {filteredResults.length === 0 ? (
                  <div className="rounded border border-[#2d3942] bg-[#0d151a] p-2 text-xs text-[#8ea1ab]">
                    No matches for the selected filter.
                  </div>
                ) : (
                  filteredResults.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-[#e9edef]">{entry.title}</div>
                        <div className="rounded border border-[#2f4a5a] bg-[#0f1d27] px-1.5 py-0.5 text-[10px] text-[#b7d8e8]">
                          {entry.domain}
                        </div>
                      </div>
                      <div className="mt-1 text-[#8ea1ab]">{entry.snippet}</div>
                      <div className="mt-1 text-[11px] text-[#6f838d]">
                        {entry.originLabel} • owner: {entry.ownerUserId} • score: {entry.score.toFixed(3)}
                      </div>
                      <div className="mt-1 text-[11px] text-[#6f838d]">
                        updated: {formatTimestamp(entry.createdAtIso)}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </>
        ) : (
          <section className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">
              Run a query to search across personal and workspace knowledge/activity/workflow history.
            </div>
          </section>
        )}

        {status ? (
          <div className="rounded border border-[#2d3942] bg-[#0d151a] px-3 py-2 text-xs text-[#aebec8]">
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CrossWorkspaceSearchPanel;
