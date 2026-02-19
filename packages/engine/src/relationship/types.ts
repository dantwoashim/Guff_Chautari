export type RelationshipStage =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'close'
  | 'intimate';

export type AttachmentStyle = 'anxious' | 'avoidant' | 'secure' | 'disorganized';

export type RepairAction =
  | 'acknowledge_harm'
  | 'apology'
  | 'behavior_change'
  | 'follow_through'
  | 'check_in';

export interface AttachmentBehaviorProfile {
  silenceToleranceHours: number;
  reassuranceNeed: number;
  conflictEscalation: number;
  repairResponsiveness: number;
  conflictStyle: 'pursue' | 'withdraw' | 'balanced' | 'volatile';
}

export interface SeasonalState {
  turnCount: number;
  phase: 'honeymoon' | 'settling' | 'mature';
  intensity: number;
  comfort: number;
}

export interface RelationshipState {
  stage: RelationshipStage;
  trustScore: number;
  messageCount: number;
  daysTogether: number;
  unresolvedConflict: boolean;
  attachmentStyle: AttachmentStyle;
  repairProgress: number;
  seasonal: SeasonalState;
}

export interface RelationshipInteraction {
  positiveSignals?: number;
  negativeSignals?: number;
  conflictTriggered?: boolean;
  silenceHours?: number;
  repairActions?: RepairAction[];
  daysElapsed?: number;
}

export interface RepairEvaluation {
  score: number;
  completed: boolean;
  missingActions: RepairAction[];
}
