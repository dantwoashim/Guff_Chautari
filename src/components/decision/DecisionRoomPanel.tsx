import { useMemo, useState } from 'react';
import type { Message } from '../../../types';
import {
  buildCounterfactual,
  buildConversationReferences,
  buildDecisionIntelligenceEvidence,
  buildDecisionRecommendation,
  compareScenarios,
  listDecisionEvidence,
  rankDecisionOptions,
  simulateFutureOutcomes,
  summarizeFollowThrough,
  type DecisionMatrix,
  type DecisionEvidence,
  type DecisionTelemetryEvent,
} from '../../decision';
import type { MemoryHit } from '../../engine/pipeline/types';

interface DecisionRoomPanelProps {
  userId?: string;
  matrix: DecisionMatrix;
  memories: ReadonlyArray<MemoryHit>;
  history: ReadonlyArray<Message>;
  telemetryEvents?: ReadonlyArray<DecisionTelemetryEvent>;
  pastDecisions?: ReadonlyArray<{
    decisionId: string;
    question: string;
    createdAtIso: string;
    selectedOptionId?: string;
  }>;
  onComplete?: (optionId: string) => void;
  onFollowThrough?: (outcome: 'success' | 'partial' | 'failed') => void;
  onOpenCounterfactual?: (payload: { decisionId: string; query: string }) => void;
}

const scorePercent = (value: number): string => `${Math.round(value * 100)}%`;

const EvidenceList = ({ evidence }: { evidence: ReadonlyArray<DecisionEvidence> }) => {
  return (
    <ul className="space-y-2">
      {evidence.map((entry) => (
        <li key={entry.id} className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-zinc-400">{entry.type}</span>
            <span className="text-[11px] text-zinc-500">{scorePercent(entry.score)}</span>
          </div>
          <p className="text-xs text-zinc-200">{entry.content}</p>
          {entry.provenance_message_ids.length > 0 ? (
            <p className="mt-1 text-[11px] text-zinc-500">
              sources: {entry.provenance_message_ids.join(', ')}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
};

export const DecisionRoomPanel = ({
  userId,
  matrix,
  memories,
  history,
  telemetryEvents = [],
  pastDecisions = [],
  onComplete,
  onFollowThrough,
  onOpenCounterfactual,
}: DecisionRoomPanelProps) => {
  const rankings = useMemo(() => rankDecisionOptions(matrix), [matrix]);
  const recommendation = useMemo(() => buildDecisionRecommendation(matrix), [matrix]);
  const scenarios = useMemo(() => compareScenarios(matrix), [matrix]);
  const intelligence = useMemo(() => {
    if (!userId) {
      return null;
    }

    return buildDecisionIntelligenceEvidence({
      userId,
      question: matrix.question,
      baseEvidence: {
        memories,
        history,
        limit: 10,
      },
    });
  }, [history, matrix.question, memories, userId]);

  const evidence = useMemo(() => intelligence?.evidence ?? [], [intelligence?.evidence]);
  const boardroomEvidence = useMemo(
    () =>
      userId
        ? listDecisionEvidence({
            userId,
            matrixId: matrix.id,
            limit: 12,
          })
        : [],
    [matrix.id, userId]
  );
  const mergedEvidence = useMemo(() => {
    const combined = [...evidence, ...boardroomEvidence];
    return combined.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return Date.parse(right.timestamp_iso) - Date.parse(left.timestamp_iso);
    });
  }, [boardroomEvidence, evidence]);
  const conversationRefs = useMemo(
    () => buildConversationReferences({ history, question: matrix.question, limit: 6 }),
    [history, matrix.question]
  );
  const futureOutcomes = useMemo(
    () => simulateFutureOutcomes({ matrix, horizonMonths: 3 }),
    [matrix]
  );
  const followThrough = useMemo(
    () => summarizeFollowThrough(telemetryEvents),
    [telemetryEvents]
  );
  const [counterfactualOptionId, setCounterfactualOptionId] = useState<string>(
    matrix.options[1]?.id ?? matrix.options[0]?.id ?? ''
  );

  const counterfactual = useMemo(() => {
    const selectedOption = recommendation?.recommended_option_id ?? matrix.options[0]?.id;
    if (!selectedOption || !counterfactualOptionId) return null;
    if (selectedOption === counterfactualOptionId) return null;

    return buildCounterfactual({
      matrix,
      selectedOptionId: selectedOption,
      alternativeOptionId: counterfactualOptionId,
      horizonMonths: 3,
    });
  }, [counterfactualOptionId, matrix, recommendation?.recommended_option_id]);

  return (
    <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
      <header>
        <h3 className="text-sm font-semibold text-zinc-100">Decision Room</h3>
        <p className="mt-1 text-xs text-zinc-400">{matrix.question}</p>
      </header>

      {recommendation ? (
        <div className="rounded-lg border border-sky-900 bg-sky-950/30 px-3 py-2">
          <p className="text-xs text-sky-200">
            Recommended: <strong>{recommendation.recommended_option_id}</strong> ({scorePercent(recommendation.score)})
          </p>
          <p className="mt-1 text-xs text-sky-300">{recommendation.rationale}</p>
          <p className="mt-1 text-[11px] text-sky-400">
            assumptions: {recommendation.assumption_refs.join(', ') || 'none'}
          </p>
        </div>
      ) : null}

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Option Matrix</h4>
        <ul className="space-y-2">
          {rankings.map((ranking) => (
            <li key={ranking.option_id} className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-100">{ranking.option_title}</span>
                <span className="text-xs text-zinc-300">{scorePercent(ranking.score)}</span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                assumptions: {ranking.assumption_refs.join(', ') || 'none'}
              </p>
              <button
                type="button"
                className="mt-2 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800/50"
                onClick={() => onComplete?.(ranking.option_id)}
              >
                Mark Completed
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Assumptions</h4>
        <ul className="space-y-1 text-xs text-zinc-300">
          {matrix.assumptions.map((assumption) => (
            <li key={assumption.id}>
              <strong>{assumption.id}</strong> ({Math.round(assumption.confidence * 100)}%, {assumption.impact}) - {assumption.text}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Scenario Compare</h4>
        <ul className="space-y-1 text-xs text-zinc-300">
          {scenarios.map((scenario) => (
            <li key={scenario.branch_id}>
              {scenario.branch_label}: {scenario.top_option_id ?? 'none'} ({scorePercent(scenario.top_score)})
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Evidence</h4>
        <EvidenceList evidence={mergedEvidence} />
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Knowledge Synthesis
        </h4>
        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-300">
          {intelligence?.synthesis.answer ??
            'Knowledge retrieval is unavailable until user context is attached.'}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Conversation Context
        </h4>
        <ul className="space-y-1 text-xs text-zinc-300">
          {conversationRefs.length === 0 ? (
            <li className="text-zinc-500">No strongly relevant prior messages found.</li>
          ) : (
            conversationRefs.map((reference) => (
              <li key={reference.message_id}>
                <strong>{Math.round(reference.relevance * 100)}%</strong> - {reference.excerpt} (
                {new Date(reference.timestamp_iso).toLocaleTimeString()})
              </li>
            ))
          )}
        </ul>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Future Simulation (3 months)
        </h4>
        <div className="space-y-2">
          {futureOutcomes.map((outcome) => (
            <div key={outcome.option_id} className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2">
              <div className="text-xs text-zinc-100">{outcome.option_title}</div>
              <div className="mt-1 text-[11px] text-zinc-400">
                {outcome.points.map((point) => `M${point.month}: ${scorePercent(point.projected_score)}`).join(' · ')}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Counterfactual</h4>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-400" htmlFor="counterfactual-option">
            What if option:
          </label>
          <select
            id="counterfactual-option"
            value={counterfactualOptionId}
            onChange={(event) => setCounterfactualOptionId(event.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
          >
            {matrix.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-xs text-zinc-300">
          {counterfactual?.summary ?? 'Select a different option to generate a counterfactual projection.'}
        </p>
        <button
          type="button"
          className="mt-2 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800/50"
          onClick={() =>
            onOpenCounterfactual?.({
              decisionId: matrix.id,
              query: `What if I had chosen option B in last week's ${matrix.question.toLowerCase()}?`,
            })
          }
        >
          Open What If Lab
        </button>
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Past Decisions
        </h4>
        {pastDecisions.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No prior decision snapshots captured yet.
          </p>
        ) : (
          <div className="space-y-2">
            {pastDecisions.map((decision) => (
              <div
                key={decision.decisionId}
                className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs"
              >
                <div className="text-zinc-200">{decision.question}</div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  {new Date(decision.createdAtIso).toLocaleString()} • {decision.decisionId}
                </div>
                <button
                  type="button"
                  className="mt-2 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800/50"
                  onClick={() =>
                    onOpenCounterfactual?.({
                      decisionId: decision.decisionId,
                      query: `What if I had chosen option B in last week's ${decision.question.toLowerCase()}?`,
                    })
                  }
                >
                  What if?
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Follow-through Dashboard
        </h4>
        <div className="grid gap-2 sm:grid-cols-3 text-xs text-zinc-300">
          <div>
            Decisions created: <strong>{followThrough.total_decisions}</strong>
          </div>
          <div>
            Decisions completed: <strong>{followThrough.completed}</strong>
          </div>
          <div>
            Follow-through success: <strong>{Math.round(followThrough.success_rate * 100)}%</strong>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border border-emerald-700 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30"
          onClick={() => onFollowThrough?.('success')}
        >
          Follow-through: Success
        </button>
        <button
          type="button"
          className="rounded border border-amber-700 px-2 py-1 text-xs text-amber-300 hover:bg-amber-900/30"
          onClick={() => onFollowThrough?.('partial')}
        >
          Follow-through: Partial
        </button>
        <button
          type="button"
          className="rounded border border-rose-700 px-2 py-1 text-xs text-rose-300 hover:bg-rose-900/30"
          onClick={() => onFollowThrough?.('failed')}
        >
          Follow-through: Failed
        </button>
      </div>
    </section>
  );
};
