import { listActivityEvents } from '../activity';
import { rankDecisionOptions } from '../decision';
import { retrieveKnowledge } from '../knowledge';
import { ingestKnowledgeNote } from '../knowledge';
import { parseCounterfactualQuery } from './queryParser';
import { getCounterfactualDecisionRecord, listCounterfactualDecisionRecords } from './store';
import type {
  AlternativeScenario,
  ConfidenceRange,
  CounterfactualDecisionRecord,
  CounterfactualQuery,
  ScenarioPath,
  ScenarioTimelinePoint,
} from './types';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

const overlap = (left: string, right: string): number => {
  const leftTokens = [...new Set(tokenize(left))];
  const rightSet = new Set(tokenize(right));
  if (leftTokens.length === 0 || rightSet.size === 0) return 0;
  const shared = leftTokens.filter((token) => rightSet.has(token)).length;
  return shared / leftTokens.length;
};

const scoreMap = (record: CounterfactualDecisionRecord): Map<string, number> => {
  return new Map(rankDecisionOptions(record.matrix).map((ranking) => [ranking.option_id, ranking.score]));
};

const averageAssumptionConfidence = (record: CounterfactualDecisionRecord, optionId: string): number => {
  const option = record.matrix.options.find((entry) => entry.id === optionId);
  const assumptionIds = option?.assumption_ids ?? [];
  if (assumptionIds.length === 0) return 0.6;

  const values = assumptionIds
    .map((id) => record.matrix.assumptions.find((assumption) => assumption.id === id)?.confidence)
    .filter((value): value is number => typeof value === 'number');

  if (values.length === 0) return 0.6;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const buildTimeline = (payload: {
  baseScore: number;
  optionLabel: string;
  scoreGap: number;
  executionMomentum: number;
  riskPressure: number;
  confidenceDelta: number;
  totalDownstreamEvents: number;
  mode: 'actual' | 'counterfactual';
}): ScenarioTimelinePoint[] => {
  const phases = [
    { stage: 'Week 1', factor: 0.35 },
    { stage: 'Week 4', factor: 0.7 },
    { stage: 'Month 3', factor: 1 },
  ];

  return phases.map((phase) => {
    const trend = payload.executionMomentum * 0.08 * phase.factor - payload.riskPressure * 0.06 * phase.factor;
    const counterfactualShift =
      payload.mode === 'counterfactual'
        ? payload.scoreGap * (0.55 + phase.factor * 0.55) + payload.confidenceDelta * 0.04 * phase.factor
        : 0;

    const projectedScore = Number(clamp(payload.baseScore + trend + counterfactualShift, 0, 1).toFixed(4));

    const changedEventEstimate =
      payload.mode === 'actual'
        ? 0
        : Math.round(
            payload.totalDownstreamEvents * clamp(Math.abs(payload.scoreGap) * (0.35 + phase.factor * 0.65), 0, 1)
          );

    return {
      stage: phase.stage,
      projectedScore,
      changedEventEstimate,
      rationale:
        payload.mode === 'actual'
          ? `${payload.optionLabel} baseline projected through observed execution/risk trend.`
          : `${payload.optionLabel} projection adjusted by option swap impact and downstream sensitivity.`,
    };
  });
};

const summarizeDownstreamTypes = (eventTypes: ReadonlyArray<string>): string[] => {
  const counts = new Map<string, number>();
  for (const eventType of eventTypes) {
    counts.set(eventType, (counts.get(eventType) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([eventType, count]) => `${eventType} (${count})`);
};

const toConfidenceRange = (payload: {
  scoreGap: number;
  downstreamEventCount: number;
  emotionalStability: number;
}): ConfidenceRange => {
  const observability = clamp(payload.downstreamEventCount / 45, 0, 1);
  const separation = clamp(Math.abs(payload.scoreGap), 0, 1);

  const medium = Number(
    clamp(0.34 + observability * 0.25 + separation * 0.28 + payload.emotionalStability * 0.13, 0.12, 0.95).toFixed(3)
  );
  const spread = clamp(0.24 - observability * 0.1 - separation * 0.08 + (1 - payload.emotionalStability) * 0.1, 0.06, 0.3);

  const low = Number(clamp(medium - spread, 0.01, 0.99).toFixed(3));
  const high = Number(clamp(medium + spread, 0.01, 0.99).toFixed(3));

  return {
    low,
    medium,
    high,
    rationale: `Confidence reflects option separation (${(separation * 100).toFixed(1)}%), downstream observability (${payload.downstreamEventCount} events), and emotional stability signal.`,
  };
};

const resolveDecisionRecord = (payload: {
  query: CounterfactualQuery;
  decisionRecords?: ReadonlyArray<CounterfactualDecisionRecord>;
}): CounterfactualDecisionRecord => {
  const fromPayload = payload.decisionRecords?.find((record) => record.decisionId === payload.query.decisionId);
  if (fromPayload) return fromPayload;

  const fromStore = getCounterfactualDecisionRecord({
    userId: payload.query.userId,
    decisionId: payload.query.decisionId,
  });
  if (!fromStore) {
    throw new Error(`Decision ${payload.query.decisionId} not found in counterfactual records.`);
  }

  return fromStore;
};

const buildScenarioPath = (payload: {
  record: CounterfactualDecisionRecord;
  optionId: string;
  scoreGap: number;
  executionMomentum: number;
  riskPressure: number;
  confidenceDelta: number;
  totalDownstreamEvents: number;
  mode: 'actual' | 'counterfactual';
}): ScenarioPath => {
  const option = payload.record.matrix.options.find((entry) => entry.id === payload.optionId);
  if (!option) {
    throw new Error(`Option ${payload.optionId} was not found on decision ${payload.record.decisionId}.`);
  }

  const baseScore = scoreMap(payload.record).get(payload.optionId) ?? 0;

  return {
    optionId: option.id,
    optionTitle: option.title,
    baseScore: Number(baseScore.toFixed(4)),
    timeline: buildTimeline({
      baseScore,
      optionLabel: option.title,
      scoreGap: payload.scoreGap,
      executionMomentum: payload.executionMomentum,
      riskPressure: payload.riskPressure,
      confidenceDelta: payload.confidenceDelta,
      totalDownstreamEvents: payload.totalDownstreamEvents,
      mode: payload.mode,
    }),
  };
};

export const simulateCounterfactualScenario = (payload: {
  query: CounterfactualQuery;
  nowIso?: string;
  decisionRecords?: ReadonlyArray<CounterfactualDecisionRecord>;
}): AlternativeScenario => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const record = resolveDecisionRecord({
    query: payload.query,
    decisionRecords: payload.decisionRecords,
  });

  const optionScores = scoreMap(record);
  const selectedScore = optionScores.get(payload.query.referenceOptionId) ?? 0;
  const alternativeScore = optionScores.get(payload.query.alternativeOptionId) ?? 0;
  const scoreGap = Number((alternativeScore - selectedScore).toFixed(4));

  const downstreamEvents = listActivityEvents({
    userId: payload.query.userId,
    filter: {
      dateFromIso: record.createdAtIso,
      dateToIso: nowIso,
    },
    limit: 500,
  });

  const eventTypes = downstreamEvents.map((event) => event.eventType);
  const workflowEvents = eventTypes.filter((eventType) => eventType.startsWith('workflow.')).length;
  const knowledgeEvents = eventTypes.filter((eventType) => eventType.startsWith('knowledge.')).length;
  const riskEvents = eventTypes.filter(
    (eventType) => eventType.includes('failed') || eventType.includes('error')
  ).length;

  const executionMomentum = clamp((workflowEvents + knowledgeEvents) / 20, 0, 1);
  const riskPressure = clamp(riskEvents / 10, 0, 1);

  const selectedConfidence = averageAssumptionConfidence(record, payload.query.referenceOptionId);
  const alternativeConfidence = averageAssumptionConfidence(record, payload.query.alternativeOptionId);
  const confidenceDelta = Number((alternativeConfidence - selectedConfidence).toFixed(4));

  const actualPath = buildScenarioPath({
    record,
    optionId: payload.query.referenceOptionId,
    scoreGap,
    executionMomentum,
    riskPressure,
    confidenceDelta,
    totalDownstreamEvents: downstreamEvents.length,
    mode: 'actual',
  });

  const counterfactualPath = buildScenarioPath({
    record,
    optionId: payload.query.alternativeOptionId,
    scoreGap,
    executionMomentum,
    riskPressure,
    confidenceDelta,
    totalDownstreamEvents: downstreamEvents.length,
    mode: 'counterfactual',
  });

  const actualFinalScore = actualPath.timeline[actualPath.timeline.length - 1]?.projectedScore ?? selectedScore;
  const counterfactualFinalScore =
    counterfactualPath.timeline[counterfactualPath.timeline.length - 1]?.projectedScore ?? alternativeScore;

  const knowledge = retrieveKnowledge({
    userId: payload.query.userId,
    query: `${record.question} ${payload.query.rawQuery}`,
    topK: 4,
    nowIso,
  });

  const conversationSignals = record.messages
    .map((message) => ({
      text: message.text,
      score: overlap(record.question, message.text),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((entry) => entry.text.slice(0, 160));

  const knowledgeSignals = knowledge.hits
    .slice(0, 3)
    .map((hit) => `${hit.source.title} (${Math.round(hit.score * 100)}%)`);

  const changedDownstreamEvents = Math.round(
    downstreamEvents.length * clamp(Math.abs(scoreGap) * (0.5 + (1 - riskPressure) * 0.5), 0, 1)
  );

  const expectedExecutionDelta = Number((scoreGap * 0.3 + confidenceDelta * 0.2).toFixed(4));
  const expectedRiskDelta = Number((scoreGap * -0.22 + (selectedConfidence - alternativeConfidence) * 0.14).toFixed(4));

  const scoreDelta = Number((counterfactualFinalScore - actualFinalScore).toFixed(4));

  const summary =
    scoreDelta > 0
      ? `Counterfactual path projects +${(scoreDelta * 100).toFixed(1)} points by Month 3 with ${changedDownstreamEvents}/${downstreamEvents.length} downstream events plausibly shifting.`
      : scoreDelta < 0
        ? `Counterfactual path projects ${(Math.abs(scoreDelta) * 100).toFixed(1)} points lower by Month 3 with ${changedDownstreamEvents}/${downstreamEvents.length} downstream events plausibly shifting.`
        : `Counterfactual and actual paths converge by Month 3 under current downstream evidence.`;

  const emotionalStability = clamp(
    1 - (Math.abs(record.emotionalContext.valence - 0.5) * 1.2 + record.emotionalContext.arousal * 0.55),
    0,
    1
  );

  return {
    query: payload.query,
    decisionId: record.decisionId,
    question: record.question,
    selectedOptionId: payload.query.referenceOptionId,
    alternativeOptionId: payload.query.alternativeOptionId,
    context: {
      knowledgeSignals,
      conversationSignals,
      emotionalState: record.emotionalContext,
      downstreamEventTypes: summarizeDownstreamTypes(eventTypes),
    },
    actualPath,
    counterfactualPath,
    outcomeDelta: {
      scoreDelta,
      expectedExecutionDelta,
      expectedRiskDelta,
      changedDownstreamEvents,
      totalDownstreamEvents: downstreamEvents.length,
      summary,
    },
    confidence: toConfidenceRange({
      scoreGap,
      downstreamEventCount: downstreamEvents.length,
      emotionalStability,
    }),
    generatedAtIso: nowIso,
  };
};

export const runCounterfactualSimulationFromText = (payload: {
  userId: string;
  rawQuery: string;
  nowIso?: string;
  decisionRecords?: ReadonlyArray<CounterfactualDecisionRecord>;
  preferredDecisionId?: string;
}): AlternativeScenario => {
  const records =
    payload.decisionRecords ?? listCounterfactualDecisionRecords({ userId: payload.userId, limit: 80 });

  const query = parseCounterfactualQuery({
    userId: payload.userId,
    rawQuery: payload.rawQuery,
    nowIso: payload.nowIso,
    decisionRecords: records,
    preferredDecisionId: payload.preferredDecisionId,
  });

  return simulateCounterfactualScenario({
    query,
    nowIso: payload.nowIso,
    decisionRecords: records,
  });
};

export const persistCounterfactualScenarioArtifact = (payload: {
  userId: string;
  scenario: AlternativeScenario;
  nowIso?: string;
}): { sourceId: string } => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const scenario = payload.scenario;
  const note = [
    `Counterfactual Scenario Analysis`,
    `Decision: ${scenario.question} (${scenario.decisionId})`,
    `Swap: ${scenario.actualPath.optionTitle} -> ${scenario.counterfactualPath.optionTitle}`,
    `Outcome: ${scenario.outcomeDelta.summary}`,
    `Confidence: low ${(scenario.confidence.low * 100).toFixed(1)}% | mid ${(scenario.confidence.medium * 100).toFixed(1)}% | high ${(scenario.confidence.high * 100).toFixed(1)}%`,
    `Knowledge Signals: ${scenario.context.knowledgeSignals.join(' | ') || 'none'}`,
    `Downstream Types: ${scenario.context.downstreamEventTypes.join(' | ') || 'none'}`,
  ].join('\n');

  const ingestion = ingestKnowledgeNote({
    userId: payload.userId,
    title: `Scenario analysis - ${scenario.decisionId}`,
    text: note,
    nowIso,
    tags: ['scenario-analysis', 'counterfactual', scenario.decisionId],
  });

  return {
    sourceId: ingestion.source.id,
  };
};
