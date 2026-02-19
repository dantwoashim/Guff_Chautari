import React, { useMemo, useState } from 'react';
import {
  loadPublishedBenchmarkHistory,
  publishWeeklyBenchmarks,
  type WeeklyBenchmarkRecord,
} from '../../benchmark/publishing';

interface BenchmarkPublishingPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

const createSparkline = (records: ReadonlyArray<WeeklyBenchmarkRecord>): string => {
  if (records.length === 0) return '';
  const values = records.slice(-12).map((record) => record.compositeScore);
  return values.map((value) => '▁▂▃▄▅▆▇█'[Math.min(7, Math.floor(value * 8))]).join('');
};

export const BenchmarkPublishingPanel: React.FC<BenchmarkPublishingPanelProps> = ({ userId }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const [status, setStatus] = useState('');

  const refresh = () => setRefreshTick((tick) => tick + 1);

  const history = useMemo(() => {
    void userId;
    void refreshTick;
    return loadPublishedBenchmarkHistory().sort(
      (left, right) => Date.parse(left.generatedAtIso) - Date.parse(right.generatedAtIso)
    );
  }, [refreshTick, userId]);

  const latest = history[history.length - 1] ?? null;
  const sparkline = useMemo(() => createSparkline(history), [history]);

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Benchmark Publishing</h2>
            <p className="text-sm text-[#8696a0]">
              Weekly score history, regression alerts, social card output, and release badge tracking.
            </p>
          </div>
          <button
            type="button"
            className="rounded border border-[#00a884] px-3 py-1.5 text-xs text-[#aef5e9] hover:bg-[#12453f] disabled:opacity-50"
            disabled={isPublishing}
            onClick={() => {
              void (async () => {
                setIsPublishing(true);
                try {
                  const published = await publishWeeklyBenchmarks();
                  setStatus(`Published weekly benchmark ${published.id}.`);
                  refresh();
                } catch (error) {
                  setStatus(error instanceof Error ? error.message : 'Benchmark publish failed.');
                } finally {
                  setIsPublishing(false);
                }
              })();
            }}
          >
            {isPublishing ? 'Publishing...' : 'Run Weekly Publish'}
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Latest Badge</h3>
            {latest ? (
              <div className="space-y-1 text-xs">
                <div className="text-[#dffaf3]">Tier: {latest.badgeTier}</div>
                <div>Composite: {pct(latest.compositeScore)}</div>
                <div>Generated: {new Date(latest.generatedAtIso).toLocaleString()}</div>
                <div>Trend: {sparkline || 'n/a'}</div>
              </div>
            ) : (
              <div className="text-xs text-[#8ea1ab]">No weekly record yet.</div>
            )}
          </section>

          <section className={`${panelClass} lg:col-span-2`}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Suite Scores (Latest)</h3>
            {latest ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.entries(latest.suiteScores) as Array<[string, number]>).map(([suite, score]) => (
                  <div key={suite} className="rounded border border-[#27343d] bg-[#0f171c] px-3 py-2 text-xs">
                    <div className="uppercase text-[#8fa1ab]">{suite}</div>
                    <div className="text-[#e9edef]">{pct(score)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-[#8ea1ab]">Publish first weekly run to view scores.</div>
            )}
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Regression Alerts</h3>
            {latest?.regressions.length ? (
              <div className="space-y-2">
                {latest.regressions.map((alert) => (
                  <div key={`${alert.suite}-${alert.deltaPercent}`} className="rounded border border-[#7b3b3b] bg-[#3b1d1d] p-2 text-xs">
                    <div className="text-[#f3cbcb]">
                      {alert.suite}: {pct(alert.previous)} → {pct(alert.current)} ({alert.deltaPercent}%)
                    </div>
                    <div className="text-[#e5a3a3]">Severity: {alert.severity}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-[#8ea1ab]">No regressions above 5%.</div>
            )}
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Social Card Preview</h3>
            {latest ? (
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(latest.socialCardSvg)}`}
                alt="Benchmark social card"
                className="w-full rounded border border-[#27343d]"
              />
            ) : (
              <div className="text-xs text-[#8ea1ab]">No social card generated yet.</div>
            )}
          </section>
        </div>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">History</h3>
          <div className="space-y-2 text-xs">
            {history.length === 0 ? (
              <div className="text-[#8ea1ab]">No published history yet.</div>
            ) : (
              history
                .slice(-12)
                .reverse()
                .map((record) => (
                  <div key={record.id} className="rounded border border-[#27343d] bg-[#0f171c] px-3 py-2">
                    <div className="text-[#e9edef]">
                      {new Date(record.generatedAtIso).toLocaleDateString()} • {record.badgeTier} •{' '}
                      {pct(record.compositeScore)}
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

export default BenchmarkPublishingPanel;
