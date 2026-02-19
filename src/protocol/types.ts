export type ProtocolWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type ProtocolActivityType =
  | 'morning_routine'
  | 'focus_block'
  | 'check_in'
  | 'decision_framework'
  | 'review'
  | 'recovery';

export interface ExtractedValue {
  id: string;
  title: string;
  description: string;
  confidence: number;
  evidence: string[];
}

export interface ProtocolActivity {
  id: string;
  type: ProtocolActivityType;
  title: string;
  description: string;
  startTime: string;
  durationMinutes: number;
  triggers: string[];
  checkCriteria: string[];
  autonomousPlanHint?: string;
}

export interface ProtocolDay {
  weekday: ProtocolWeekday;
  theme: string;
  activities: ProtocolActivity[];
}

export interface PersonalProtocol {
  id: string;
  userId: string;
  workspaceId: string;
  version: number;
  values: ExtractedValue[];
  goals: string[];
  days: ProtocolDay[];
  generatedAtIso: string;
}

export type AdherenceStatus = 'completed' | 'partial' | 'missed';

export interface ProtocolAdherenceRecord {
  id: string;
  protocolId: string;
  workspaceId: string;
  userId: string;
  dateIso: string;
  weekday: ProtocolWeekday;
  activityId: string;
  status: AdherenceStatus;
  score: number;
  notes?: string;
  createdAtIso: string;
}

export interface ProtocolActivation {
  workspaceId: string;
  protocolId: string;
  createdWorkflowIds: string[];
  scheduledCheckInIds: string[];
  activatedAtIso: string;
}

export interface ProtocolExecutionReport {
  protocolId: string;
  workspaceId: string;
  weekday: ProtocolWeekday;
  dateIso: string;
  adherenceRate: number;
  completed: number;
  partial: number;
  missed: number;
  generatedAutonomousPlanIds: string[];
}

export interface ExtractValuesInput {
  userId: string;
  nowIso?: string;
  windowDays?: number;
  events?: ReadonlyArray<{
    title: string;
    description: string;
    eventType: string;
    category: string;
    createdAtIso: string;
  }>;
  decisions?: ReadonlyArray<{
    question: string;
    selectedOption: string;
    rationale?: string;
    createdAtIso: string;
  }>;
  goals?: ReadonlyArray<{
    title: string;
    status?: string;
    note?: string;
    updatedAtIso?: string;
  }>;
  reflections?: ReadonlyArray<{
    text: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
    createdAtIso: string;
  }>;
}

export interface GenerateProtocolInput {
  userId: string;
  workspaceId: string;
  values: ReadonlyArray<ExtractedValue>;
  goals: ReadonlyArray<string>;
  nowIso?: string;
}

export interface ExecuteProtocolDayInput {
  workspaceId: string;
  userId: string;
  dateIso: string;
  adherenceByActivityId?: Record<string, AdherenceStatus>;
}
