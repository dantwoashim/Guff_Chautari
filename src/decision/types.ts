import type { Message } from '../../types';
import type { MemoryHit } from '../engine/pipeline/types';

export interface DecisionCriterion {
  id: string;
  title: string;
  description: string;
  weight: number;
}

export interface DecisionOption {
  id: string;
  title: string;
  description: string;
  scores: Record<string, number>;
  assumption_ids?: string[];
}

export interface DecisionAssumption {
  id: string;
  text: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
}

export interface ScenarioBranch {
  id: string;
  label: string;
  parent_id: string | null;
  criterion_weight_overrides?: Record<string, number>;
  option_score_overrides?: Record<string, Record<string, number>>;
  assumption_confidence_overrides?: Record<string, number>;
  note?: string;
}

export interface DecisionMatrix {
  id: string;
  question: string;
  criteria: DecisionCriterion[];
  options: DecisionOption[];
  assumptions: DecisionAssumption[];
  branches: ScenarioBranch[];
  created_at_iso: string;
  completed_at_iso?: string;
  follow_through_at_iso?: string;
}

export interface OptionCriterionBreakdown {
  criterion_id: string;
  criterion_title: string;
  normalized_weight: number;
  raw_score: number;
  weighted_score: number;
}

export interface OptionRanking {
  option_id: string;
  option_title: string;
  score: number;
  criterion_breakdown: OptionCriterionBreakdown[];
  assumption_refs: string[];
}

export interface DecisionRecommendation {
  matrix_id: string;
  recommended_option_id: string;
  score: number;
  rationale: string;
  assumption_refs: string[];
}

export type DecisionEvidenceType = 'memory' | 'history' | 'knowledge';

export interface DecisionEvidence {
  id: string;
  type: DecisionEvidenceType;
  content: string;
  score: number;
  timestamp_iso: string;
  source_id: string;
  provenance_message_ids: string[];
}

export interface DecisionEvidenceInput {
  memories: ReadonlyArray<MemoryHit>;
  history: ReadonlyArray<Message>;
  now_iso?: string;
  limit?: number;
}

export interface ConversationReference {
  message_id: string;
  excerpt: string;
  relevance: number;
  timestamp_iso: string;
}

export interface FutureSimulationPoint {
  month: number;
  projected_score: number;
}

export interface FutureSimulationOutcome {
  option_id: string;
  option_title: string;
  assumptions: string[];
  points: FutureSimulationPoint[];
}

export interface CounterfactualResult {
  selected_option_id: string;
  alternative_option_id: string;
  score_delta: number;
  summary: string;
}

export interface FollowThroughSummary {
  total_decisions: number;
  completed: number;
  follow_through_success: number;
  follow_through_partial: number;
  follow_through_failed: number;
  success_rate: number;
}

export type DecisionTelemetryEventType =
  | 'decision_created'
  | 'decision_completed'
  | 'decision_follow_through';

export interface DecisionTelemetryEvent {
  id: string;
  type: DecisionTelemetryEventType;
  decision_id: string;
  created_at_iso: string;
  metadata: Record<string, string | number | boolean>;
}

export interface ScenarioEvaluation {
  branch_id: string;
  branch_label: string;
  top_option_id: string | null;
  top_score: number;
  rankings: OptionRanking[];
}
