export type AutonomousPlanStatus = 'active' | 'paused' | 'completed' | 'failed' | 'halted';

export type AutonomousTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'approval_required';

export interface AutonomousTask {
  id: string;
  planId: string;
  dayIndex: number;
  title: string;
  description: string;
  status: AutonomousTaskStatus;
  isIrreversible?: boolean;
  estimatedTokens?: number;
  estimatedApiCalls?: number;
  estimatedConnectorActions?: number;
  createdAtIso: string;
  updatedAtIso: string;
  notes?: string;
}

export interface AutonomyUsage {
  tokensUsed: number;
  apiCalls: number;
  connectorActions: number;
  runtimeMinutes: number;
}

export interface DailyProgressReport {
  id: string;
  planId: string;
  dayIndex: number;
  completedTasks: number;
  failedTasks: number;
  blockedTasks: number;
  summary: string;
  adaptations: string[];
  nextSteps: string[];
  createdAtIso: string;
}

export interface AutonomousPlan {
  id: string;
  userId: string;
  workspaceId: string;
  goal: string;
  status: AutonomousPlanStatus;
  durationDays: number;
  currentDayIndex: number;
  tasks: AutonomousTask[];
  usage: AutonomyUsage;
  reports: DailyProgressReport[];
  history: string[];
  createdAtIso: string;
  updatedAtIso: string;
  lastError?: string;
}

export interface CreateAutonomousPlanInput {
  userId: string;
  workspaceId: string;
  goal: string;
  durationDays: number;
  seedTasksByDay?: ReadonlyArray<
    ReadonlyArray<
      Omit<
        AutonomousTask,
        'id' | 'planId' | 'dayIndex' | 'status' | 'createdAtIso' | 'updatedAtIso'
      >
    >
  >;
  nowIso?: string;
}

export interface ExecuteDayResult {
  plan: AutonomousPlan;
  dayIndex: number;
  report: DailyProgressReport;
}

export interface AutonomyResourceBudget {
  maxTokens: number;
  maxApiCalls: number;
  maxConnectorActions: number;
  maxRuntimeHours: number;
}

export interface AutonomyGuardrailPolicy {
  escalationThresholdPct: number;
  resourceBudget: AutonomyResourceBudget;
}

export type GuardrailEscalationType = 'budget' | 'irreversible' | 'timebox' | 'kill_switch';
export type GuardrailEscalationStatus = 'pending' | 'approved' | 'rejected' | 'resolved';

export interface GuardrailEscalation {
  id: string;
  planId: string;
  type: GuardrailEscalationType;
  status: GuardrailEscalationStatus;
  reason: string;
  metadata?: Record<string, string | number | boolean>;
  createdAtIso: string;
  resolvedAtIso?: string;
  resolvedByUserId?: string;
}

export interface GuardrailActionInput {
  planId: string;
  actionId: string;
  irreversible?: boolean;
  estimatedUsage?: Partial<AutonomyUsage>;
  nowIso?: string;
}

export interface GuardrailEvaluation {
  allow: boolean;
  blockedByKillSwitch: boolean;
  escalation?: GuardrailEscalation;
}
