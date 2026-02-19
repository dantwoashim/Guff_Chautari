import type { Message } from '../../types';
import type { DecisionMatrix } from '../decision';

export interface CounterfactualEmotionalContext {
  valence: number;
  arousal: number;
  intensity: 'low' | 'medium' | 'high';
  summary: string;
}

export interface CounterfactualMessageSnapshot {
  id: string;
  role: Message['role'];
  text: string;
  timestamp: number;
}

export interface CounterfactualDecisionRecord {
  userId: string;
  decisionId: string;
  question: string;
  matrix: DecisionMatrix;
  createdAtIso: string;
  updatedAtIso: string;
  selectedOptionId?: string;
  threadId?: string;
  tags: string[];
  messages: CounterfactualMessageSnapshot[];
  emotionalContext: CounterfactualEmotionalContext;
}

export interface CounterfactualTimeWindow {
  label: string;
  startIso: string;
  endIso: string;
}

export interface CounterfactualQuery {
  id: string;
  userId: string;
  rawQuery: string;
  decisionId: string;
  referenceOptionId: string;
  alternativeOptionId: string;
  parsedAtIso: string;
  matchedBy: 'explicit_decision' | 'topic' | 'temporal' | 'fallback';
  notes: string[];
  timeWindow: CounterfactualTimeWindow | null;
}

export interface ScenarioTimelinePoint {
  stage: string;
  projectedScore: number;
  changedEventEstimate: number;
  rationale: string;
}

export interface ScenarioPath {
  optionId: string;
  optionTitle: string;
  baseScore: number;
  timeline: ScenarioTimelinePoint[];
}

export interface OutcomeDelta {
  scoreDelta: number;
  expectedExecutionDelta: number;
  expectedRiskDelta: number;
  changedDownstreamEvents: number;
  totalDownstreamEvents: number;
  summary: string;
}

export interface ConfidenceRange {
  low: number;
  medium: number;
  high: number;
  rationale: string;
}

export interface AlternativeScenario {
  query: CounterfactualQuery;
  decisionId: string;
  question: string;
  selectedOptionId: string;
  alternativeOptionId: string;
  context: {
    knowledgeSignals: string[];
    conversationSignals: string[];
    emotionalState: CounterfactualEmotionalContext;
    downstreamEventTypes: string[];
  };
  actualPath: ScenarioPath;
  counterfactualPath: ScenarioPath;
  outcomeDelta: OutcomeDelta;
  confidence: ConfidenceRange;
  generatedAtIso: string;
}

export type ProjectionHorizon = '1w' | '1m' | '3m';
export type ProjectionTrendDirection = 'up' | 'flat' | 'down';

export interface ProjectionProbabilityRange {
  low: number;
  medium: number;
  high: number;
}

export interface ProjectionHorizonOutcome {
  horizon: ProjectionHorizon;
  label: string;
  probability: ProjectionProbabilityRange;
  expectedImpactScore: number;
  keyDependencies: string[];
  riskFactors: string[];
  summary: string;
}

export interface ProjectedOutcome {
  id: string;
  userId: string;
  action: string;
  generatedAtIso: string;
  context: {
    knowledgeSignals: string[];
    activeWorkflowNames: string[];
    scheduledTasks: Array<{
      workflowId: string;
      workflowName: string;
      nextRunAtIso: string;
    }>;
    emotionalTrendDirection: ProjectionTrendDirection;
    relationshipStage: string;
    relationshipTrustScore: number;
  };
  keyDependencies: string[];
  riskFactors: string[];
  horizons: ProjectionHorizonOutcome[];
  confidence: ProjectionProbabilityRange;
}

export type FollowThroughStatusType = 'on_track' | 'at_risk' | 'missed';

export interface FollowThroughStatus {
  userId: string;
  decisionId: string;
  question: string;
  selectedOptionId?: string;
  decisionCreatedAtIso: string;
  expectedByIso: string;
  evaluatedAtIso: string;
  status: FollowThroughStatusType;
  evidenceCount: number;
  lastEvidenceAtIso?: string;
  daysSinceDecision: number;
}

export interface FollowThroughNudge {
  id: string;
  userId: string;
  decisionId: string;
  createdAtIso: string;
  level: 'gentle' | 'firm';
  title: string;
  message: string;
}

export interface FollowThroughEvaluation {
  status: FollowThroughStatus;
  nudge: FollowThroughNudge | null;
}

export interface FollowThroughDashboardSummary {
  generatedAtIso: string;
  totalDecisions: number;
  onTrack: number;
  atRisk: number;
  missed: number;
  statuses: FollowThroughStatus[];
  nudges: FollowThroughNudge[];
}
