import { retrieveKnowledge, synthesizeKnowledgeAnswer, type KnowledgeRetrievalResult, type KnowledgeSynthesisResult } from '../knowledge';
import { buildDecisionEvidence } from './evidence';
import { rankDecisionOptions } from './optionMatrix';
import type {
  ConversationReference,
  CounterfactualResult,
  DecisionEvidence,
  DecisionEvidenceInput,
  DecisionMatrix,
  FollowThroughSummary,
  FutureSimulationOutcome,
  OptionRanking,
  DecisionTelemetryEvent,
} from './types';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const toIso = (timestamp: number): string => new Date(timestamp).toISOString();

const tokenize = (value: string): string[] => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
};

const overlapScore = (query: string, text: string): number => {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return 0;

  const textSet = new Set(tokenize(text));
  const overlap = queryTokens.filter((token) => textSet.has(token)).length;
  return clamp(overlap / queryTokens.length, 0, 1);
};

const excerpt = (text: string, max = 180): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
};

const rankingMap = (rankings: ReadonlyArray<OptionRanking>): Map<string, OptionRanking> => {
  return new Map(rankings.map((ranking) => [ranking.option_id, ranking]));
};

const averageAssumptionConfidence = (matrix: DecisionMatrix, assumptionIds: ReadonlyArray<string>): number => {
  if (assumptionIds.length === 0) return 0.6;
  const confidences = assumptionIds
    .map((id) => matrix.assumptions.find((assumption) => assumption.id === id)?.confidence)
    .filter((value): value is number => typeof value === 'number');

  if (confidences.length === 0) return 0.6;
  return confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
};

const monthlyProjection = (
  baseScore: number,
  assumptionConfidence: number,
  month: number,
  assumptionCount: number
): number => {
  const confidenceLift = (assumptionConfidence - 0.5) * 0.08 * month;
  const volatilityPenalty = Math.min(0.03, assumptionCount * 0.004) * month;
  return Number(clamp(baseScore + confidenceLift - volatilityPenalty, 0, 1).toFixed(4));
};

export const buildConversationReferences = (
  payload: {
    history: ReadonlyArray<{
      id: string;
      text: string;
      timestamp: number;
    }>;
    question: string;
    limit?: number;
  }
): ConversationReference[] => {
  const limit = Math.max(1, payload.limit ?? 6);

  return payload.history
    .filter((message) => message.text.trim().length > 0)
    .map((message) => ({
      message_id: message.id,
      excerpt: excerpt(message.text),
      relevance: Number(overlapScore(payload.question, message.text).toFixed(3)),
      timestamp_iso: toIso(message.timestamp),
    }))
    .filter((entry) => entry.relevance > 0)
    .sort((left, right) => {
      if (right.relevance !== left.relevance) return right.relevance - left.relevance;
      return Date.parse(right.timestamp_iso) - Date.parse(left.timestamp_iso);
    })
    .slice(0, limit);
};

export const simulateFutureOutcomes = (
  payload: {
    matrix: DecisionMatrix;
    horizonMonths?: number;
  }
): FutureSimulationOutcome[] => {
  const horizonMonths = Math.max(1, Math.min(12, payload.horizonMonths ?? 3));
  const rankings = rankDecisionOptions(payload.matrix);
  const byOptionId = rankingMap(rankings);

  return payload.matrix.options.map((option) => {
    const ranking = byOptionId.get(option.id);
    const baseScore = ranking?.score ?? 0;
    const assumptionRefs = option.assumption_ids ?? [];
    const confidence = averageAssumptionConfidence(payload.matrix, assumptionRefs);

    return {
      option_id: option.id,
      option_title: option.title,
      assumptions: assumptionRefs,
      points: Array.from({ length: horizonMonths }, (_, index) => {
        const month = index + 1;
        return {
          month,
          projected_score: monthlyProjection(baseScore, confidence, month, assumptionRefs.length),
        };
      }),
    };
  });
};

export const buildCounterfactual = (
  payload: {
    matrix: DecisionMatrix;
    selectedOptionId: string;
    alternativeOptionId: string;
    horizonMonths?: number;
  }
): CounterfactualResult => {
  const outcomes = simulateFutureOutcomes({
    matrix: payload.matrix,
    horizonMonths: payload.horizonMonths ?? 3,
  });

  const selected = outcomes.find((item) => item.option_id === payload.selectedOptionId);
  const alternative = outcomes.find((item) => item.option_id === payload.alternativeOptionId);

  if (!selected || !alternative) {
    return {
      selected_option_id: payload.selectedOptionId,
      alternative_option_id: payload.alternativeOptionId,
      score_delta: 0,
      summary: 'Counterfactual unavailable because one of the options was not found.',
    };
  }

  const selectedFinal = selected.points[selected.points.length - 1]?.projected_score ?? 0;
  const alternativeFinal = alternative.points[alternative.points.length - 1]?.projected_score ?? 0;
  const scoreDelta = Number((alternativeFinal - selectedFinal).toFixed(4));

  const summary =
    scoreDelta > 0
      ? `Alternative path projects +${Math.round(scoreDelta * 100)} points over the selected path by month ${selected.points.length}.`
      : scoreDelta < 0
        ? `Alternative path projects ${Math.abs(Math.round(scoreDelta * 100))} points lower than the selected path by month ${selected.points.length}.`
        : `Alternative and selected paths project equal scores by month ${selected.points.length}.`;

  return {
    selected_option_id: payload.selectedOptionId,
    alternative_option_id: payload.alternativeOptionId,
    score_delta: scoreDelta,
    summary,
  };
};

export const summarizeFollowThrough = (
  events: ReadonlyArray<DecisionTelemetryEvent>
): FollowThroughSummary => {
  let completed = 0;
  let success = 0;
  let partial = 0;
  let failed = 0;

  for (const event of events) {
    if (event.type === 'decision_completed') {
      completed += 1;
      continue;
    }

    if (event.type !== 'decision_follow_through') continue;

    const outcome = event.metadata.outcome;
    if (outcome === 'success') success += 1;
    if (outcome === 'partial') partial += 1;
    if (outcome === 'failed') failed += 1;
  }

  const totalFollowThrough = success + partial + failed;
  const successRate = totalFollowThrough === 0 ? 0 : Number((success / totalFollowThrough).toFixed(3));

  return {
    total_decisions: events.filter((event) => event.type === 'decision_created').length,
    completed,
    follow_through_success: success,
    follow_through_partial: partial,
    follow_through_failed: failed,
    success_rate: successRate,
  };
};

export const buildDecisionIntelligenceEvidence = (
  payload: {
    userId: string;
    question: string;
    baseEvidence: DecisionEvidenceInput;
    topK?: number;
  }
): {
  evidence: DecisionEvidence[];
  retrieval: KnowledgeRetrievalResult;
  synthesis: KnowledgeSynthesisResult;
} => {
  const base = buildDecisionEvidence(payload.baseEvidence);
  const retrieval = retrieveKnowledge({
    userId: payload.userId,
    query: payload.question,
    topK: payload.topK ?? 4,
  });

  const synthesis = synthesizeKnowledgeAnswer(retrieval);

  const knowledgeEvidence: DecisionEvidence[] = retrieval.hits.map((hit) => ({
    id: `knowledge-${hit.node.id}`,
    type: 'knowledge',
    content: hit.node.text,
    score: hit.score,
    timestamp_iso: hit.node.createdAtIso,
    source_id: hit.source.id,
    provenance_message_ids: [],
  }));

  const merged = [...base, ...knowledgeEvidence].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return Date.parse(right.timestamp_iso) - Date.parse(left.timestamp_iso);
  });

  return {
    evidence: merged.slice(0, Math.max(payload.baseEvidence.limit ?? 10, 10)),
    retrieval,
    synthesis,
  };
};
