import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  logFutureProjectionActivity,
  listCounterfactualDecisionRecords,
  persistCounterfactualScenarioArtifact,
  projectFutureOutcome,
  runCounterfactualSimulationFromText,
  runFollowThroughTracker,
  summarizeFollowThroughDashboard,
  type AlternativeScenario,
  type FollowThroughDashboardSummary,
  type ProjectedOutcome,
} from '../../counterfactual';
import type { Message } from '../../../types';

interface CounterfactualPanelProps {
  userId: string;
  messages?: ReadonlyArray<Message>;
  threadId?: string | null;
  initialQuery?: string;
  decisionIdHint?: string;
  onBack?: () => void;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const scorePercent = (value: number): string => `${(value * 100).toFixed(1)}%`;

const DeltaBadge = ({ value }: { value: number }) => {
  const positive = value > 0;
  const neutral = value === 0;

  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${
        neutral
          ? 'bg-[#26343d] text-[#b5c7d4]'
          : positive
            ? 'bg-[#173b38] text-[#aef5e9]'
            : 'bg-[#3b1d1d] text-[#f0c2c2]'
      }`}
    >
      {positive ? '+' : ''}
      {(value * 100).toFixed(1)}
    </span>
  );
};

export const CounterfactualPanel: React.FC<CounterfactualPanelProps> = ({
  userId,
  messages = [],
  threadId,
  initialQuery,
  decisionIdHint,
  onBack,
}) => {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [futureAction, setFutureAction] = useState('launch product next week');
  const [preferredDecisionId, setPreferredDecisionId] = useState<string | undefined>(decisionIdHint);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<AlternativeScenario | null>(null);
  const [projection, setProjection] = useState<ProjectedOutcome | null>(null);
  const [followThrough, setFollowThrough] = useState<FollowThroughDashboardSummary | null>(null);

  const records = useMemo(
    () => listCounterfactualDecisionRecords({ userId, limit: 20 }),
    [userId]
  );

  const refreshFollowThrough = useCallback(() => {
    runFollowThroughTracker({
      userId,
    });
    setFollowThrough(
      summarizeFollowThroughDashboard({
        userId,
      })
    );
  }, [userId]);

  useEffect(() => {
    if (!initialQuery) return;
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (!decisionIdHint) return;
    setPreferredDecisionId(decisionIdHint);
  }, [decisionIdHint]);

  useEffect(() => {
    if (query.trim().length > 0) return;
    if (records.length === 0) return;
    const latest = records[0];
    setQuery(`What if I had chosen option B in last week's ${latest.question.toLowerCase()}?`);
    setPreferredDecisionId(latest.decisionId);
  }, [query, records]);

  useEffect(() => {
    refreshFollowThrough();
  }, [records.length, refreshFollowThrough]);

  const runSimulation = () => {
    setError('');
    setStatus('Running counterfactual simulation...');

    try {
      const scenario = runCounterfactualSimulationFromText({
        userId,
        rawQuery: query,
        preferredDecisionId,
      });
      persistCounterfactualScenarioArtifact({
        userId,
        scenario,
      });
      setResult(scenario);
      refreshFollowThrough();
      setStatus(`Scenario generated for decision ${scenario.decisionId} and saved to knowledge graph.`);
    } catch (scenarioError) {
      setResult(null);
      setStatus('');
      setError(scenarioError instanceof Error ? scenarioError.message : 'Counterfactual simulation failed.');
    }
  };

  const runFutureProjection = () => {
    setError('');
    setStatus('Running future projection...');

    try {
      const nextProjection = projectFutureOutcome({
        userId,
        action: futureAction,
        messages,
      });
      setProjection(nextProjection);
      logFutureProjectionActivity({
        userId,
        projection: nextProjection,
        threadId: threadId ?? undefined,
      });
      setStatus(`Future projection generated across 1 week / 1 month / 3 month horizons.`);
    } catch (projectionError) {
      setProjection(null);
      setStatus('');
      setError(projectionError instanceof Error ? projectionError.message : 'Future projection failed.');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className={panelClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#e9edef]">Counterfactual Engine</h2>
              <p className="mt-1 text-sm text-[#8696a0]">
                Ask "what if" questions on prior decisions and compare actual vs alternative timelines.
              </p>
            </div>
            {onBack ? (
              <button
                type="button"
                className="rounded border border-[#313d45] px-3 py-1.5 text-xs text-[#b5c0c7] hover:bg-[#202c33]"
                onClick={onBack}
              >
                Back
              </button>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="What if I had chosen option B in last week's pricing decision?"
              className="min-h-[88px] rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            />
            <button
              type="button"
              className="h-fit rounded border border-[#00a884] px-3 py-2 text-xs text-[#aef5e9] hover:bg-[#12453f]"
              onClick={runSimulation}
              disabled={query.trim().length === 0}
            >
              Run Simulation
            </button>
          </div>

          {records.length === 0 ? (
            <div className="mt-3 rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              No decision snapshots found yet. Open Decision Room and complete at least one decision first.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-[#8ea1ab]">Recent decisions</div>
              <div className="grid gap-2 md:grid-cols-2">
                {records.slice(0, 6).map((record) => (
                  <button
                    key={record.decisionId}
                    type="button"
                    onClick={() => {
                      setPreferredDecisionId(record.decisionId);
                      setQuery(`What if I had chosen option B in last week's ${record.question.toLowerCase()}?`);
                    }}
                    className={`rounded border p-3 text-left text-xs ${
                      preferredDecisionId === record.decisionId
                        ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                        : 'border-[#2d3942] bg-[#0f171c] text-[#9fb0ba]'
                    }`}
                  >
                    <div className="text-[#e9edef]">{record.question}</div>
                    <div className="mt-1 text-[11px] text-[#8ea1ab]">
                      {new Date(record.createdAtIso).toLocaleString()} • {record.decisionId}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {status ? (
          <div className="rounded border border-[#31596b] bg-[#102531] px-3 py-2 text-xs text-[#b8dbeb]">{status}</div>
        ) : null}

        {error ? (
          <div className="rounded border border-[#7b3b3b] bg-[#3b1d1d] px-3 py-2 text-xs text-[#f0c2c2]">{error}</div>
        ) : null}

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Future Simulation</h3>
          <p className="mb-2 text-xs text-[#8ea1ab]">
            Project likely outcomes for a proposed action over 1 week / 1 month / 3 months.
          </p>

          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              value={futureAction}
              onChange={(event) => setFutureAction(event.target.value)}
              placeholder="launch product next week"
              className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            />
            <button
              type="button"
              className="rounded border border-[#4f8fc7] px-3 py-2 text-xs text-[#cae4f9] hover:bg-[#173247]"
              onClick={runFutureProjection}
              disabled={futureAction.trim().length === 0}
            >
              Project Action
            </button>
          </div>

          {projection ? (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                {projection.horizons.map((horizon) => (
                  <div key={horizon.horizon} className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs">
                    <div className="text-[#e9edef]">{horizon.label}</div>
                    <div className="mt-1 text-[#8ea1ab]">
                      {(horizon.probability.low * 100).toFixed(1)}% - {(horizon.probability.high * 100).toFixed(1)}%
                    </div>
                    <div className="mt-1 text-[#7bd0b6]">mid {(horizon.probability.medium * 100).toFixed(1)}%</div>
                    <div className="mt-1 text-[#9fb0ba]">{horizon.summary}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs">
                  <div className="text-[#8ea1ab]">Key dependencies</div>
                  <div className="mt-1 text-[#9fb0ba]">{projection.keyDependencies.join(' • ')}</div>
                </div>
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs">
                  <div className="text-[#8ea1ab]">Risk factors</div>
                  <div className="mt-1 text-[#9fb0ba]">{projection.riskFactors.join(' • ')}</div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {result ? (
          <>
            <section className={panelClass}>
              <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Parsed Query</h3>
              <div className="grid gap-2 text-xs md:grid-cols-2">
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-2">
                  <div className="text-[#8ea1ab]">Decision</div>
                  <div className="text-[#e9edef]">{result.question}</div>
                  <div className="mt-1 text-[11px] text-[#8ea1ab]">{result.decisionId}</div>
                </div>
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-2">
                  <div className="text-[#8ea1ab]">Option Swap</div>
                  <div className="text-[#e9edef]">
                    {result.actualPath.optionTitle} → {result.counterfactualPath.optionTitle}
                  </div>
                  <div className="mt-1 text-[11px] text-[#8ea1ab]">match: {result.query.matchedBy}</div>
                </div>
              </div>
            </section>

            <section className={panelClass}>
              <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Timeline Fork</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs">
                  <div className="mb-2 text-[#e9edef]">Actual Path • {result.actualPath.optionTitle}</div>
                  <div className="space-y-2">
                    {result.actualPath.timeline.map((point) => (
                      <div key={`actual-${point.stage}`} className="rounded border border-[#23313a] bg-[#101a20] p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[#8ea1ab]">{point.stage}</span>
                          <span className="text-[#dfe7eb]">{scorePercent(point.projectedScore)}</span>
                        </div>
                        <div className="mt-1 h-2 rounded bg-[#22303a]">
                          <div
                            className="h-2 rounded bg-[#4f8fc7]"
                            style={{ width: `${Math.round(point.projectedScore * 100)}%` }}
                          />
                        </div>
                        <div className="mt-1 text-[11px] text-[#7f929c]">{point.rationale}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs">
                  <div className="mb-2 text-[#e9edef]">
                    Counterfactual Path • {result.counterfactualPath.optionTitle}
                  </div>
                  <div className="space-y-2">
                    {result.counterfactualPath.timeline.map((point) => (
                      <div key={`counter-${point.stage}`} className="rounded border border-[#23313a] bg-[#101a20] p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[#8ea1ab]">{point.stage}</span>
                          <span className="text-[#dffaf3]">{scorePercent(point.projectedScore)}</span>
                        </div>
                        <div className="mt-1 h-2 rounded bg-[#22303a]">
                          <div
                            className="h-2 rounded bg-[#00a884]"
                            style={{ width: `${Math.round(point.projectedScore * 100)}%` }}
                          />
                        </div>
                        <div className="mt-1 text-[11px] text-[#7bd0b6]">
                          changed events estimate: {point.changedEventEstimate}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className={panelClass}>
              <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Outcome Comparison</h3>
              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs">
                  <div className="text-[#8ea1ab]">Score Delta</div>
                  <div className="mt-1 text-[#e9edef]">
                    <DeltaBadge value={result.outcomeDelta.scoreDelta} />
                  </div>
                </div>
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs">
                  <div className="text-[#8ea1ab]">Execution Delta</div>
                  <div className="mt-1 text-[#e9edef]">
                    <DeltaBadge value={result.outcomeDelta.expectedExecutionDelta} />
                  </div>
                </div>
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs">
                  <div className="text-[#8ea1ab]">Risk Delta</div>
                  <div className="mt-1 text-[#e9edef]">
                    <DeltaBadge value={result.outcomeDelta.expectedRiskDelta} />
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#9fb0ba]">
                {result.outcomeDelta.summary}
              </div>
            </section>

            <section className={panelClass}>
              <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Confidence + Context</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs">
                  <div className="text-[#8ea1ab]">Confidence range</div>
                  <div className="mt-1 text-[#e9edef]">
                    {scorePercent(result.confidence.low)} - {scorePercent(result.confidence.high)}
                  </div>
                  <div className="mt-1 text-[#7f929c]">mid {scorePercent(result.confidence.medium)}</div>
                  <div className="mt-2 text-[#8ea1ab]">{result.confidence.rationale}</div>
                </div>

                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs">
                  <div className="text-[#8ea1ab]">Context signals</div>
                  <div className="mt-1 text-[#9fb0ba]">
                    emotional: {result.context.emotionalState.summary}
                  </div>
                  <div className="mt-2 text-[#8ea1ab]">knowledge:</div>
                  <div className="text-[#9fb0ba]">
                    {result.context.knowledgeSignals.length > 0
                      ? result.context.knowledgeSignals.join(' • ')
                      : 'none'}
                  </div>
                  <div className="mt-2 text-[#8ea1ab]">downstream:</div>
                  <div className="text-[#9fb0ba]">
                    {result.context.downstreamEventTypes.length > 0
                      ? result.context.downstreamEventTypes.join(' • ')
                      : 'none'}
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {followThrough ? (
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Decision Follow-through Tracker</h3>
            <div className="grid gap-2 text-xs md:grid-cols-4">
              <div className="rounded border border-[#2d3942] bg-[#0f171c] p-2">
                <div className="text-[#8ea1ab]">Decisions</div>
                <div className="text-[#e9edef]">{followThrough.totalDecisions}</div>
              </div>
              <div className="rounded border border-[#2d3942] bg-[#0f171c] p-2">
                <div className="text-[#8ea1ab]">On track</div>
                <div className="text-[#bde8c8]">{followThrough.onTrack}</div>
              </div>
              <div className="rounded border border-[#2d3942] bg-[#0f171c] p-2">
                <div className="text-[#8ea1ab]">At risk</div>
                <div className="text-[#f5d9a7]">{followThrough.atRisk}</div>
              </div>
              <div className="rounded border border-[#2d3942] bg-[#0f171c] p-2">
                <div className="text-[#8ea1ab]">Missed</div>
                <div className="text-[#f0c2c2]">{followThrough.missed}</div>
              </div>
            </div>

            {followThrough.nudges.length > 0 ? (
              <div className="mt-3 space-y-2">
                {followThrough.nudges.map((nudge) => (
                  <div key={nudge.id} className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs">
                    <div className="text-[#e9edef]">{nudge.title}</div>
                    <div className="mt-1 text-[#9fb0ba]">{nudge.message}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                No active follow-through nudges.
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
};

export default CounterfactualPanel;
