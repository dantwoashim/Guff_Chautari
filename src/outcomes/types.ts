export type OutcomeMetricType = 'binary' | 'numeric' | 'percentage' | 'qualitative';
export type OutcomeDirection = 'increase' | 'decrease' | 'maintain';
export type OutcomeCheckInFrequency = 'daily' | 'weekly' | 'monthly';

export type OutcomeGoalStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export type OutcomeAssessmentStatus = 'on_track' | 'at_risk' | 'behind' | 'achieved';

export type OutcomeMetricValue = number | boolean | string;

export interface OutcomeMetric {
  id: string;
  label: string;
  type: OutcomeMetricType;
  direction: OutcomeDirection;
  targetValue: OutcomeMetricValue;
  baselineValue?: OutcomeMetricValue;
  currentValue?: OutcomeMetricValue;
  unit?: string;
  updatedAtIso?: string;
}

export interface OutcomeMilestone {
  id: string;
  title: string;
  targetDateIso: string;
  metricId?: string;
  targetValue?: OutcomeMetricValue;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  completedAtIso?: string;
  notes?: string;
}

export interface OutcomeGoal {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: OutcomeGoalStatus;
  checkInFrequency: OutcomeCheckInFrequency;
  metrics: OutcomeMetric[];
  milestones: OutcomeMilestone[];
  linkedWorkflows: string[];
  linkedDecisions: string[];
  linkedHabits: string[];
  createdAtIso: string;
  updatedAtIso: string;
  startDateIso?: string;
  targetDateIso?: string;
}

export interface OutcomeCheckIn {
  id: string;
  userId: string;
  goalId: string;
  atIso: string;
  metricValues: Record<string, OutcomeMetricValue>;
  note?: string;
}

export interface OutcomeAssessment {
  goalId: string;
  userId: string;
  generatedAtIso: string;
  status: OutcomeAssessmentStatus;
  progressScore: number;
  milestonesCompleted: number;
  milestonesTotal: number;
  overdueMilestones: number;
  summary: string;
  nextActions: string[];
}

export interface OutcomeWeeklyScorecard {
  userId: string;
  generatedAtIso: string;
  windowStartIso: string;
  windowEndIso: string;
  activeOutcomes: number;
  assessmentsByStatus: Record<OutcomeAssessmentStatus, number>;
  completedMilestones: number;
  totalMilestones: number;
  checkInsLogged: number;
}

export interface OutcomeCorrelationFactor {
  id: string;
  type: 'decision' | 'workflow' | 'habit' | 'emotional' | 'other';
  label: string;
  correlation: number;
  confidence: number;
  evidence: string;
}

export interface OutcomeCorrelationReport {
  goalId: string;
  userId: string;
  generatedAtIso: string;
  factors: OutcomeCorrelationFactor[];
  narrative: string;
}

export type OutcomeNudgeType =
  | 'behind_pace'
  | 'at_risk'
  | 'on_track'
  | 'milestone_achieved'
  | 'quiet_window_deferred';

export interface OutcomeNudge {
  id: string;
  userId: string;
  goalId: string;
  createdAtIso: string;
  type: OutcomeNudgeType;
  priority: 'low' | 'medium' | 'high';
  title: string;
  message: string;
  deferred: boolean;
  deliverAfterIso?: string;
}

export interface OutcomeNudgeBatch {
  generatedAtIso: string;
  nudges: OutcomeNudge[];
  deferredCount: number;
}
