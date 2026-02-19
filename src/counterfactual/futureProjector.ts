import type { Message } from '../../types';
import { emitActivityEvent } from '../activity';
import { buildEmotionalTrend, buildRelationshipTimeline } from '../analytics';
import type { WorkflowStore } from '../workflows';
import { workflowStore as defaultWorkflowStore } from '../workflows';
import { retrieveKnowledge } from '../knowledge';
import type {
  ProjectionHorizon,
  ProjectionHorizonOutcome,
  ProjectionTrendDirection,
  ProjectedOutcome,
} from './types';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const keywordScore = (text: string, words: ReadonlyArray<string>): number => {
  const lowered = text.toLowerCase();
  return words.reduce((sum, word) => sum + (lowered.includes(word) ? 1 : 0), 0);
};

const hasLaunchIntent = (action: string): boolean => {
  return keywordScore(action, ['launch', 'ship', 'release', 'go live']) > 0;
};

const inferTrendDirection = (messages: ReadonlyArray<Message>, nowIso: string): ProjectionTrendDirection => {
  const trend = buildEmotionalTrend({
    personaId: 'future-projector',
    messages,
    windowDays: 14,
    nowIso,
  });

  if (trend.points.length < 2) return 'flat';

  const split = Math.max(1, Math.floor(trend.points.length / 2));
  const early = trend.points.slice(0, split);
  const late = trend.points.slice(split);

  const avg = (values: ReadonlyArray<number>) =>
    values.length === 0 ? 0.5 : values.reduce((sum, value) => sum + value, 0) / values.length;

  const earlyValence = avg(early.map((point) => point.valence));
  const lateValence = avg(late.map((point) => point.valence));
  const delta = lateValence - earlyValence;

  if (delta > 0.08) return 'up';
  if (delta < -0.08) return 'down';
  return 'flat';
};

const stageMultiplier = (stage: string): number => {
  const lowered = stage.toLowerCase();
  if (lowered.includes('secure') || lowered.includes('attuned')) return 1.05;
  if (lowered.includes('rupture') || lowered.includes('repair')) return 0.9;
  return 1;
};

const trendMultiplier = (direction: ProjectionTrendDirection): number => {
  if (direction === 'up') return 1.06;
  if (direction === 'down') return 0.92;
  return 1;
};

const readinessFromWorkflows = (payload: {
  action: string;
  activeWorkflowNames: ReadonlyArray<string>;
  scheduledCount: number;
}): number => {
  const actionWords = payload.action
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4);

  const workflowText = payload.activeWorkflowNames.join(' ').toLowerCase();
  const keywordHits = actionWords.filter((word) => workflowText.includes(word)).length;
  const coverage = actionWords.length === 0 ? 0 : keywordHits / actionWords.length;

  return clamp(coverage * 0.5 + Math.min(1, payload.activeWorkflowNames.length / 4) * 0.3 + Math.min(1, payload.scheduledCount / 3) * 0.2, 0, 1);
};

const marketTimingSignal = (knowledgeSignals: ReadonlyArray<string>, action: string): number => {
  const marketKeywords = ['market', 'competition', 'pricing', 'demand', 'timing', 'seasonal'];
  const knowledgeScore = keywordScore(knowledgeSignals.join(' ').toLowerCase(), marketKeywords);
  const actionScore = keywordScore(action, ['launch', 'market', 'pricing', 'release']);

  return clamp(knowledgeScore * 0.12 + actionScore * 0.08, 0, 1);
};

const baseProbability = (payload: {
  readiness: number;
  marketTiming: number;
  trendDirection: ProjectionTrendDirection;
  relationshipStage: string;
  relationshipTrustScore: number;
}): number => {
  const relationship = clamp(payload.relationshipTrustScore, 0, 1) * stageMultiplier(payload.relationshipStage);
  const trend = trendMultiplier(payload.trendDirection);

  return clamp((payload.readiness * 0.45 + payload.marketTiming * 0.25 + relationship * 0.3) * trend, 0.08, 0.96);
};

const spreadByHorizon = (horizon: ProjectionHorizon): number => {
  if (horizon === '1w') return 0.2;
  if (horizon === '1m') return 0.16;
  return 0.14;
};

const horizonFactor = (horizon: ProjectionHorizon): number => {
  if (horizon === '1w') return 0.92;
  if (horizon === '1m') return 1;
  return 1.04;
};

const horizonLabel = (horizon: ProjectionHorizon): string => {
  if (horizon === '1w') return '1 week';
  if (horizon === '1m') return '1 month';
  return '3 months';
};

const buildDependencies = (payload: {
  action: string;
  readiness: number;
  marketTiming: number;
  hasScheduled: boolean;
}): string[] => {
  const launchIntent = hasLaunchIntent(payload.action);

  const dependencies = [
    payload.readiness >= 0.6
      ? 'Team readiness remains above execution threshold.'
      : 'Team readiness plan must close ownership and capacity gaps.',
    payload.hasScheduled
      ? 'Scheduled execution loops stay active through rollout.'
      : 'At least one scheduled execution loop should be configured.',
    payload.marketTiming >= 0.55
      ? 'Market timing signals remain favorable.'
      : 'Market timing confidence needs stronger evidence before commitment.',
  ];

  if (launchIntent) {
    dependencies.unshift('Launch preparation checklist is complete before go-live window.');
  }

  return dependencies;
};

const buildRiskFactors = (payload: {
  action: string;
  readiness: number;
  marketTiming: number;
  trendDirection: ProjectionTrendDirection;
}): string[] => {
  const launchIntent = hasLaunchIntent(payload.action);
  const risks: string[] = [];

  if (launchIntent || payload.readiness < 0.65) {
    risks.push('Preparation gaps may delay execution sequencing and launch quality.');
  }
  if (payload.readiness < 0.55) {
    risks.push('Team readiness is below ideal threshold and could create delivery slips.');
  }
  if (payload.marketTiming < 0.5) {
    risks.push('Market timing confidence is low; demand or competitive context may shift.');
  }
  if (payload.trendDirection === 'down') {
    risks.push('Recent emotional trend is downward, increasing coordination risk under pressure.');
  }

  if (risks.length === 0) {
    risks.push('No major immediate risks detected; continue weekly validation checkpoints.');
  }

  return risks;
};

const buildHorizonOutcome = (payload: {
  horizon: ProjectionHorizon;
  base: number;
  dependencies: ReadonlyArray<string>;
  risks: ReadonlyArray<string>;
}): ProjectionHorizonOutcome => {
  const medium = clamp(payload.base * horizonFactor(payload.horizon), 0.05, 0.98);
  const spread = spreadByHorizon(payload.horizon);
  const low = clamp(medium - spread, 0.01, 0.99);
  const high = clamp(medium + spread, 0.01, 0.99);

  return {
    horizon: payload.horizon,
    label: horizonLabel(payload.horizon),
    probability: {
      low: Number(low.toFixed(3)),
      medium: Number(medium.toFixed(3)),
      high: Number(high.toFixed(3)),
    },
    expectedImpactScore: Number(clamp((medium + high) / 2, 0, 1).toFixed(3)),
    keyDependencies: [...payload.dependencies],
    riskFactors: [...payload.risks],
    summary: `Projected ${horizonLabel(payload.horizon)} success probability centers around ${(medium * 100).toFixed(1)}% if key dependencies hold.`,
  };
};

export const projectFutureOutcome = (
  payload: {
    userId: string;
    action: string;
    messages: ReadonlyArray<Message>;
    nowIso?: string;
    personaId?: string;
  },
  dependencies: {
    workflowStore?: WorkflowStore;
  } = {}
): ProjectedOutcome => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const workflowStore = dependencies.workflowStore ?? defaultWorkflowStore;
  const workflows = workflowStore
    .listWorkflows(payload.userId)
    .filter((workflow) => workflow.status === 'ready' && workflow.trigger.enabled);

  const activeWorkflowNames = workflows.map((workflow) => workflow.name);
  const scheduledTasks = workflows
    .filter((workflow) => workflow.trigger.type === 'schedule' && workflow.trigger.schedule)
    .map((workflow) => ({
      workflowId: workflow.id,
      workflowName: workflow.name,
      nextRunAtIso: workflow.trigger.schedule?.nextRunAtIso ?? nowIso,
    }));

  const knowledge = retrieveKnowledge({
    userId: payload.userId,
    query: payload.action,
    topK: 5,
    nowIso,
  });
  const knowledgeSignals = knowledge.hits.map(
    (hit) => `${hit.source.title} (${Math.round(hit.score * 100)}%)`
  );

  const emotionalTrendDirection = inferTrendDirection(payload.messages, nowIso);
  const relationshipTimeline = buildRelationshipTimeline({
    personaId: payload.personaId ?? 'future-projector',
    messages: payload.messages,
  });
  const latestRelationship = relationshipTimeline.entries[relationshipTimeline.entries.length - 1];

  const readiness = readinessFromWorkflows({
    action: payload.action,
    activeWorkflowNames,
    scheduledCount: scheduledTasks.length,
  });
  const marketTiming = marketTimingSignal(knowledgeSignals, payload.action);

  const keyDependencies = buildDependencies({
    action: payload.action,
    readiness,
    marketTiming,
    hasScheduled: scheduledTasks.length > 0,
  });
  const riskFactors = buildRiskFactors({
    action: payload.action,
    readiness,
    marketTiming,
    trendDirection: emotionalTrendDirection,
  });

  const base = baseProbability({
    readiness,
    marketTiming,
    trendDirection: emotionalTrendDirection,
    relationshipStage: latestRelationship.stage,
    relationshipTrustScore: latestRelationship.trustScore,
  });

  const horizons: ProjectionHorizonOutcome[] = (['1w', '1m', '3m'] as const).map((horizon) =>
    buildHorizonOutcome({
      horizon,
      base,
      dependencies: keyDependencies,
      risks: riskFactors,
    })
  );

  const confidenceSpread = 0.12 + Math.max(0, 0.15 - readiness * 0.1);
  const medium = Number(base.toFixed(3));

  return {
    id: makeId('future-projection'),
    userId: payload.userId,
    action: payload.action,
    generatedAtIso: nowIso,
    context: {
      knowledgeSignals,
      activeWorkflowNames,
      scheduledTasks,
      emotionalTrendDirection,
      relationshipStage: latestRelationship.stage,
      relationshipTrustScore: latestRelationship.trustScore,
    },
    keyDependencies,
    riskFactors,
    horizons,
    confidence: {
      low: Number(clamp(medium - confidenceSpread, 0.01, 0.99).toFixed(3)),
      medium,
      high: Number(clamp(medium + confidenceSpread, 0.01, 0.99).toFixed(3)),
    },
  };
};

export const logFutureProjectionActivity = (payload: {
  userId: string;
  projection: ProjectedOutcome;
  threadId?: string;
}): void => {
  emitActivityEvent({
    userId: payload.userId,
    category: 'decision',
    eventType: 'counterfactual.future_projection.generated',
    title: 'Future projection generated',
    description: `Projected action "${payload.projection.action}" across 1w/1m/3m horizons.`,
    threadId: payload.threadId,
    metadata: {
      projection_id: payload.projection.id,
      confidence_mid: payload.projection.confidence.medium,
      horizon_1w_mid: payload.projection.horizons[0]?.probability.medium ?? 0,
      horizon_1m_mid: payload.projection.horizons[1]?.probability.medium ?? 0,
      horizon_3m_mid: payload.projection.horizons[2]?.probability.medium ?? 0,
    },
  });
};
