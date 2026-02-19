export type TimelineLane = 'beliefs' | 'goals' | 'emotion' | 'knowledge' | 'decisions';

export const TIMELINE_LANES: TimelineLane[] = ['beliefs', 'goals', 'emotion', 'knowledge', 'decisions'];

export type TimelineGranularity = 'day' | 'week' | 'month' | 'quarter';

export type TimelineSourceType =
  | 'message'
  | 'activity'
  | 'decision'
  | 'counterfactual'
  | 'analytics'
  | 'manual';

export type GoalLifecycleStatus =
  | 'created'
  | 'active'
  | 'progressing'
  | 'achieved'
  | 'abandoned'
  | 'pivoted';

export interface MemorySnapshot {
  id: string;
  userId: string;
  occurredAtIso: string;
  lane: TimelineLane;
  topic: string;
  summary: string;
  sourceType: TimelineSourceType;
  sourceId: string;
  threadId?: string;
  stance?: string;
  confidence?: number;
  emotionalValence?: number;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface BeliefChange {
  id: string;
  userId: string;
  topic: string;
  oldStance: string;
  newStance: string;
  changedAtIso: string;
  triggerEventId?: string;
  triggerEventType?: string;
  confidence: number;
  evidenceSnapshotIds: string[];
}

export interface GoalEvolutionStage {
  status: GoalLifecycleStatus;
  atIso: string;
  reason: string;
  sourceEventId?: string;
}

export interface GoalEvolution {
  goalId: string;
  userId: string;
  title: string;
  createdAtIso: string;
  updatedAtIso: string;
  currentStatus: GoalLifecycleStatus;
  pivotCount: number;
  history: GoalEvolutionStage[];
  relatedEventIds: string[];
}

export interface EmotionalEpoch {
  id: string;
  userId: string;
  weekStartIso: string;
  weekEndIso: string;
  averageValence: number;
  averageArousal: number;
  dominantState: 'positive' | 'neutral' | 'negative';
  messageCount: number;
}

export interface TimelineEvent {
  id: string;
  userId: string;
  lane: TimelineLane;
  occurredAtIso: string;
  title: string;
  summary: string;
  topic: string;
  sourceType: TimelineSourceType;
  sourceId: string;
  threadId?: string;
  why: string;
  drillDownRefIds: string[];
  confidence?: number;
}

export interface TemporalWeekGroup {
  weekStartIso: string;
  weekEndIso: string;
  countsByLane: Record<TimelineLane, number>;
  eventIds: string[];
}

export interface KnowledgeGrowthPoint {
  weekStartIso: string;
  weekEndIso: string;
  newItems: number;
  topics: string[];
}

export interface TemporalMemoryIndex {
  userId: string;
  generatedAtIso: string;
  snapshots: MemorySnapshot[];
  events: TimelineEvent[];
  weekGroups: TemporalWeekGroup[];
  beliefChanges: BeliefChange[];
  goalEvolutions: GoalEvolution[];
  emotionalEpochs: EmotionalEpoch[];
  knowledgeGrowth: KnowledgeGrowthPoint[];
}

export interface TimelineBucket {
  key: string;
  label: string;
  startIso: string;
  endIso: string;
  eventIds: string[];
}

export interface TimelineRenderLane {
  lane: TimelineLane;
  label: string;
  events: TimelineEvent[];
}

export interface RenderedTimeline {
  generatedAtIso: string;
  granularity: TimelineGranularity;
  filtersApplied: {
    lanes: TimelineLane[];
    searchTerm: string;
    dateFromIso?: string;
    dateToIso?: string;
  };
  lanes: TimelineRenderLane[];
  buckets: TimelineBucket[];
  events: TimelineEvent[];
}

export interface TemporalQueryMatch {
  eventId: string;
  lane: TimelineLane;
  occurredAtIso: string;
  title: string;
  summary: string;
  topic: string;
}

export interface TemporalQueryAnswer {
  query: string;
  intent: 'belief_origin' | 'belief_change' | 'goal_evolution' | 'summary';
  answer: string;
  generatedAtIso: string;
  matches: TemporalQueryMatch[];
}
